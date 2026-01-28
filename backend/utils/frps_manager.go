package utils

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

// FrpsManagerInterface 定义 frps 管理接口
type FrpsManagerInterface interface {
	Start() error
	Stop() error
	Restart() error
	Status() FrpsStatus
	Verify(configPath string) error
	GetLogs(lines int) []string
	GetManagerType() string
}

type FrpsStatus struct {
	Running     bool      `json:"running"`
	PID         int       `json:"pid"`
	StartTime   time.Time `json:"start_time,omitempty"`
	Uptime      string    `json:"uptime,omitempty"`
	ManagerType string    `json:"manager_type"` // process 或 systemctl
}

var (
	manager FrpsManagerInterface
)

// InitFrpsManager 根据配置初始化对应的管理器
func InitFrpsManager(frpsPath, configPath, managerType, serviceName string) FrpsManagerInterface {
	if managerType == "systemctl" {
		manager = NewSystemctlManager(frpsPath, configPath, serviceName)
	} else {
		manager = NewProcessManager(frpsPath, configPath)
	}
	return manager
}

func GetFrpsManager() FrpsManagerInterface {
	return manager
}

// ============= 进程管理模式 =============

type ProcessManager struct {
	cmd         *exec.Cmd
	frpsPath    string
	configPath  string
	running     bool
	mu          sync.RWMutex
	logLines    []string
	maxLogLines int
	logMu       sync.RWMutex
	startTime   time.Time
}

func NewProcessManager(frpsPath, configPath string) *ProcessManager {
	return &ProcessManager{
		frpsPath:    frpsPath,
		configPath:  configPath,
		maxLogLines: 1000,
		logLines:    make([]string, 0),
	}
}

func (m *ProcessManager) GetManagerType() string {
	return "process"
}

func (m *ProcessManager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("frps is already running")
	}

	if _, err := os.Stat(m.configPath); os.IsNotExist(err) {
		return fmt.Errorf("config file not found: %s", m.configPath)
	}

	m.cmd = exec.Command(m.frpsPath, "-c", m.configPath)

	stdout, err := m.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %v", err)
	}
	stderr, err := m.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %v", err)
	}

	if err := m.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start frps: %v", err)
	}

	m.running = true
	m.startTime = time.Now()

	go m.readLogs(stdout)
	go m.readLogs(stderr)

	go func() {
		m.cmd.Wait()
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
	}()

	return nil
}

func (m *ProcessManager) readLogs(reader interface{ Read([]byte) (int, error) }) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		m.addLogLine(line)
	}
}

func (m *ProcessManager) addLogLine(line string) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logLine := fmt.Sprintf("[%s] %s", timestamp, line)

	m.logLines = append(m.logLines, logLine)
	if len(m.logLines) > m.maxLogLines {
		m.logLines = m.logLines[1:]
	}
}

func (m *ProcessManager) GetLogs(lines int) []string {
	m.logMu.RLock()
	defer m.logMu.RUnlock()

	if lines <= 0 || lines > len(m.logLines) {
		lines = len(m.logLines)
	}

	start := len(m.logLines) - lines
	if start < 0 {
		start = 0
	}

	result := make([]string, lines)
	copy(result, m.logLines[start:])
	return result
}

func (m *ProcessManager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running || m.cmd == nil || m.cmd.Process == nil {
		return fmt.Errorf("frps is not running")
	}

	if err := m.cmd.Process.Signal(syscall.SIGTERM); err != nil {
		m.cmd.Process.Kill()
	}

	m.running = false
	return nil
}

func (m *ProcessManager) Restart() error {
	m.mu.RLock()
	wasRunning := m.running
	m.mu.RUnlock()

	if wasRunning {
		if err := m.Stop(); err != nil {
			return err
		}
		time.Sleep(time.Second)
	}

	return m.Start()
}

func (m *ProcessManager) Status() FrpsStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := FrpsStatus{
		Running:     m.running,
		ManagerType: "process",
	}

	if m.running && m.cmd != nil && m.cmd.Process != nil {
		status.PID = m.cmd.Process.Pid
		status.StartTime = m.startTime
		status.Uptime = time.Since(m.startTime).Round(time.Second).String()
	}

	return status
}

func (m *ProcessManager) Verify(configPath string) error {
	cmd := exec.Command(m.frpsPath, "verify", "-c", configPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("config verification failed: %s", string(output))
	}
	return nil
}

// ============= Systemctl 管理模式 =============

type SystemctlManager struct {
	frpsPath    string
	configPath  string
	serviceName string
	logLines    []string
	maxLogLines int
	logMu       sync.RWMutex
}

func NewSystemctlManager(frpsPath, configPath, serviceName string) *SystemctlManager {
	return &SystemctlManager{
		frpsPath:    frpsPath,
		configPath:  configPath,
		serviceName: serviceName,
		maxLogLines: 1000,
		logLines:    make([]string, 0),
	}
}

func (m *SystemctlManager) GetManagerType() string {
	return "systemctl"
}

func (m *SystemctlManager) Start() error {
	cmd := exec.Command("systemctl", "start", m.serviceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to start %s: %s", m.serviceName, string(output))
	}
	return nil
}

func (m *SystemctlManager) Stop() error {
	cmd := exec.Command("systemctl", "stop", m.serviceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to stop %s: %s", m.serviceName, string(output))
	}
	return nil
}

func (m *SystemctlManager) Restart() error {
	cmd := exec.Command("systemctl", "restart", m.serviceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to restart %s: %s", m.serviceName, string(output))
	}
	return nil
}

func (m *SystemctlManager) Status() FrpsStatus {
	status := FrpsStatus{
		Running:     false,
		ManagerType: "systemctl",
	}

	// 检查服务是否运行
	cmd := exec.Command("systemctl", "is-active", m.serviceName)
	output, _ := cmd.Output()
	isActive := strings.TrimSpace(string(output)) == "active"
	status.Running = isActive

	if isActive {
		// 获取 PID
		cmd = exec.Command("systemctl", "show", m.serviceName, "--property=MainPID", "--value")
		output, err := cmd.Output()
		if err == nil {
			var pid int
			fmt.Sscanf(strings.TrimSpace(string(output)), "%d", &pid)
			status.PID = pid
		}

		// 获取启动时间
		cmd = exec.Command("systemctl", "show", m.serviceName, "--property=ActiveEnterTimestamp", "--value")
		output, err = cmd.Output()
		if err == nil {
			timeStr := strings.TrimSpace(string(output))
			if t, err := time.Parse("Mon 2006-01-02 15:04:05 MST", timeStr); err == nil {
				status.StartTime = t
				status.Uptime = time.Since(t).Round(time.Second).String()
			}
		}
	}

	return status
}

func (m *SystemctlManager) Verify(configPath string) error {
	cmd := exec.Command(m.frpsPath, "verify", "-c", configPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("config verification failed: %s", string(output))
	}
	return nil
}

func (m *SystemctlManager) GetLogs(lines int) []string {
	// 使用 journalctl 获取日志
	cmd := exec.Command("journalctl", "-u", m.serviceName, "-n", fmt.Sprintf("%d", lines), "--no-pager", "-o", "short-iso")
	output, err := cmd.Output()
	if err != nil {
		return []string{fmt.Sprintf("Failed to get logs: %v", err)}
	}

	logLines := strings.Split(strings.TrimSpace(string(output)), "\n")
	return logLines
}
