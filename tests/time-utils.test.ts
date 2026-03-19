import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  formatFridayDate, 
  parseDayOfWeek,
  getUpcomingDateForDay,
} from '@/lib/utils/time'

describe('Time Utilities', () => {
  describe('formatFridayDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2024-03-15T10:00:00Z')
      expect(formatFridayDate(date)).toBe('2024-03-15')
    })

    it('should handle single digit months and days', () => {
      const date = new Date('2024-01-05T10:00:00Z')
      expect(formatFridayDate(date)).toBe('2024-01-05')
    })
  })

  describe('parseDayOfWeek', () => {
    it('should return valid day of week', () => {
      expect(parseDayOfWeek('5')).toBe(5)
      expect(parseDayOfWeek('0')).toBe(0)
      expect(parseDayOfWeek('6')).toBe(6)
    })

    it('should return default for invalid values', () => {
      expect(parseDayOfWeek('7')).toBe(5)
      expect(parseDayOfWeek('-1')).toBe(5)
      expect(parseDayOfWeek('abc')).toBe(5)
      expect(parseDayOfWeek(null as any)).toBe(5)
      expect(parseDayOfWeek(undefined as any)).toBe(5)
    })
  })

  describe('getUpcomingDateForDay', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return the next occurrence of the specified day', () => {
      // Set to a Monday (2024-03-11)
      vi.setSystemTime(new Date('2024-03-11T10:00:00Z'))
      
      // Get next Friday (day 5)
      const result = getUpcomingDateForDay(5)
      expect(result.getDay()).toBe(5)
      expect(result).toBeGreaterThan(new Date('2024-03-11'))
    })

    it('should return today if reference date is the target day', () => {
      // Set to a Friday (2024-03-15)
      vi.setSystemTime(new Date('2024-03-15T10:00:00Z'))
      
      const result = getUpcomingDateForDay(5)
      expect(result.getDay()).toBe(5)
      expect(result.toDateString()).toBe(new Date('2024-03-15').toDateString())
    })
  })
})
