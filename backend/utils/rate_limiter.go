package utils

import (
	"sync"
	"time"
)

// LoginRateLimiter 登录速率限制器
type LoginRateLimiter struct {
	attempts map[string]*attemptInfo
	mu       sync.RWMutex
	// 配置
	maxAttempts   int           // 最大尝试次数
	lockDuration  time.Duration // 锁定时长
	cleanInterval time.Duration // 清理间隔
}

type attemptInfo struct {
	count     int       // 失败次数
	firstTime time.Time // 首次尝试时间
	lockUntil time.Time // 锁定截止时间
}

var (
	loginLimiter *LoginRateLimiter
	limiterOnce  sync.Once
)

// GetLoginRateLimiter 获取登录速率限制器单例
func GetLoginRateLimiter() *LoginRateLimiter {
	limiterOnce.Do(func() {
		loginLimiter = &LoginRateLimiter{
			attempts:      make(map[string]*attemptInfo),
			maxAttempts:   5,                // 5 次失败后锁定
			lockDuration:  5 * time.Minute,  // 锁定 5 分钟
			cleanInterval: 10 * time.Minute, // 每 10 分钟清理过期记录
		}
		go loginLimiter.cleanupLoop()
	})
	return loginLimiter
}

// IsBlocked 检查 IP 是否被锁定
func (l *LoginRateLimiter) IsBlocked(ip string) (bool, time.Duration) {
	l.mu.RLock()
	defer l.mu.RUnlock()

	info, exists := l.attempts[ip]
	if !exists {
		return false, 0
	}

	if time.Now().Before(info.lockUntil) {
		remaining := time.Until(info.lockUntil)
		return true, remaining
	}

	return false, 0
}

// RecordFailure 记录登录失败
func (l *LoginRateLimiter) RecordFailure(ip string) (blocked bool, remaining time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	info, exists := l.attempts[ip]

	if !exists {
		l.attempts[ip] = &attemptInfo{
			count:     1,
			firstTime: now,
		}
		return false, 0
	}

	// 如果已经锁定，返回剩余时间
	if now.Before(info.lockUntil) {
		return true, time.Until(info.lockUntil)
	}

	// 如果距离首次尝试超过锁定时长，重置计数
	if now.Sub(info.firstTime) > l.lockDuration {
		info.count = 1
		info.firstTime = now
		info.lockUntil = time.Time{}
		return false, 0
	}

	info.count++

	// 达到最大尝试次数，锁定
	if info.count >= l.maxAttempts {
		info.lockUntil = now.Add(l.lockDuration)
		return true, l.lockDuration
	}

	return false, 0
}

// RecordSuccess 记录登录成功，清除失败记录
func (l *LoginRateLimiter) RecordSuccess(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}

// GetRemainingAttempts 获取剩余尝试次数
func (l *LoginRateLimiter) GetRemainingAttempts(ip string) int {
	l.mu.RLock()
	defer l.mu.RUnlock()

	info, exists := l.attempts[ip]
	if !exists {
		return l.maxAttempts
	}

	remaining := l.maxAttempts - info.count
	if remaining < 0 {
		remaining = 0
	}
	return remaining
}

// cleanupLoop 定期清理过期记录
func (l *LoginRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(l.cleanInterval)
	defer ticker.Stop()

	for range ticker.C {
		l.cleanup()
	}
}

func (l *LoginRateLimiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	for ip, info := range l.attempts {
		// 清理已解锁且超过锁定时长的记录
		if now.After(info.lockUntil) && now.Sub(info.firstTime) > l.lockDuration*2 {
			delete(l.attempts, ip)
		}
	}
}
