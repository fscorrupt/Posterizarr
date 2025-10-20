"""
Caching layer for Posterizarr Backend
Provides in-memory caching with TTL for frequently accessed data
"""
import time
from typing import Optional, Dict, Any, Callable
from functools import wraps
import logging
import asyncio

logger = logging.getLogger(__name__)


class CacheEntry:
    """A single cache entry with TTL support"""

    def __init__(self, value: Any, ttl: int):
        self.value = value
        self.created_at = time.time()
        self.ttl = ttl

    def is_expired(self) -> bool:
        """Check if this cache entry has expired"""
        return time.time() - self.created_at > self.ttl

    def __repr__(self):
        age = int(time.time() - self.created_at)
        return f"CacheEntry(age={age}s, ttl={self.ttl}s, expired={self.is_expired()})"


class CacheManager:
    """Simple in-memory cache with TTL support"""

    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._stats = {"hits": 0, "misses": 0, "sets": 0, "invalidations": 0}

    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache, returns None if expired or not found"""
        if key in self._cache:
            entry = self._cache[key]
            if not entry.is_expired():
                self._stats["hits"] += 1
                logger.debug(f"Cache HIT: {key}")
                return entry.value
            else:
                # Auto-cleanup expired entries
                del self._cache[key]
                logger.debug(f"Cache EXPIRED: {key}")

        self._stats["misses"] += 1
        logger.debug(f"Cache MISS: {key}")
        return None

    def set(self, key: str, value: Any, ttl: int = 300):
        """Set a value in cache with TTL (default 5 minutes)"""
        self._cache[key] = CacheEntry(value, ttl)
        self._stats["sets"] += 1
        logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")

    def invalidate(self, key: str):
        """Remove a specific key from cache"""
        if key in self._cache:
            del self._cache[key]
            self._stats["invalidations"] += 1
            logger.debug(f"Cache INVALIDATED: {key}")

    def invalidate_pattern(self, pattern: str):
        """Remove all keys matching a pattern (simple string matching)"""
        keys_to_delete = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_delete:
            del self._cache[key]
            self._stats["invalidations"] += 1
        logger.debug(f"Cache INVALIDATED pattern '{pattern}': {len(keys_to_delete)} keys")

    def clear(self):
        """Clear all cache entries"""
        count = len(self._cache)
        self._cache.clear()
        self._stats["invalidations"] += count
        logger.info(f"Cache CLEARED: {count} entries removed")

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self._stats["hits"] + self._stats["misses"]
        hit_rate = (
            (self._stats["hits"] / total_requests * 100) if total_requests > 0 else 0
        )

        return {
            "entries": len(self._cache),
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "sets": self._stats["sets"],
            "invalidations": self._stats["invalidations"],
            "hit_rate": round(hit_rate, 2),
            "total_requests": total_requests,
        }

    def get_entries_info(self) -> Dict[str, Dict[str, Any]]:
        """Get detailed info about all cache entries"""
        return {
            key: {
                "age": int(time.time() - entry.created_at),
                "ttl": entry.ttl,
                "expired": entry.is_expired(),
            }
            for key, entry in self._cache.items()
        }


# Global cache instance
cache = CacheManager()


def cached(ttl: int = 300, key_func: Optional[Callable] = None):
    """
    Decorator for caching function results
    
    Args:
        ttl: Time to live in seconds (default: 5 minutes)
        key_func: Optional function to generate cache key from args/kwargs
                  If None, uses function name as key (only for no-arg functions)
    
    Usage:
        @cached(ttl=600)
        async def get_system_info():
            return expensive_operation()
            
        @cached(ttl=300, key_func=lambda file: f"font_list_{file}")
        async def get_fonts(file: str):
            return list_fonts(file)
    """

    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = f"{func.__name__}"

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = await func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = f"{func.__name__}"

            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result

        # Return appropriate wrapper based on whether function is async
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


# Convenience functions for external use
def get_cache_stats():
    """Get current cache statistics"""
    return cache.get_stats()


def get_cache_entries():
    """Get detailed cache entries info"""
    return cache.get_entries_info()


def clear_cache():
    """Clear all cache entries"""
    cache.clear()


def invalidate_cache_key(key: str):
    """Invalidate a specific cache key"""
    cache.invalidate(key)


def invalidate_cache_pattern(pattern: str):
    """Invalidate all keys matching pattern"""
    cache.invalidate_pattern(pattern)
