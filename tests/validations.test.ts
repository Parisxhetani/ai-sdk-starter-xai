import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { 
  createOrderSchema, 
  updateOrderSchema, 
  menuitemSchema,
  createMessageSchema,
  passwordResetConfirmSchema,
} from '@/lib/validations'

describe('Validation Schemas', () => {
  describe('createOrderSchema', () => {
    it('should validate valid order data', () => {
      const validData = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        friday_date: '2024-03-15',
        item: 'Pizza',
        variant: 'Margherita',
        notes: 'Extra cheese',
      }

      const result = createOrderSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const invalidData = {
        user_id: 'invalid-uuid',
        friday_date: '2024-03-15',
        item: 'Pizza',
        variant: 'Margherita',
      }

      const result = createOrderSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('user_id')
      }
    })

    it('should reject invalid date format', () => {
      const invalidData = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        friday_date: '03-15-2024',
        item: 'Pizza',
        variant: 'Margherita',
      }

      const result = createOrderSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject notes longer than 100 characters', () => {
      const invalidData = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        friday_date: '2024-03-15',
        item: 'Pizza',
        variant: 'Margherita',
        notes: 'a'.repeat(101),
      }

      const result = createOrderSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should accept null notes', () => {
      const validData = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        friday_date: '2024-03-15',
        item: 'Pizza',
        variant: 'Margherita',
        notes: null,
      }

      const result = createOrderSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('menuitemSchema', () => {
    it('should validate valid menu item', () => {
      const validData = {
        item: 'Pizza',
        variant: 'Margherita',
        active: true,
      }

      const result = menuitemSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should default active to true', () => {
      const validData = {
        item: 'Pizza',
        variant: 'Margherita',
      }

      const result = menuitemSchema.safeParse(validData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.active).toBe(true)
      }
    })

    it('should reject empty item name', () => {
      const invalidData = {
        item: '',
        variant: 'Margherita',
      }

      const result = menuitemSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('createMessageSchema', () => {
    it('should validate valid message', () => {
      const validData = {
        content: 'Hello, team!',
      }

      const result = createMessageSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject empty message', () => {
      const invalidData = {
        content: '',
      }

      const result = createMessageSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject message longer than 1000 characters', () => {
      const invalidData = {
        content: 'a'.repeat(1001),
      }

      const result = createMessageSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('passwordResetConfirmSchema', () => {
    it('should validate strong password', () => {
      const validData = {
        token: 'valid-token-123',
        password: 'SecurePass123',
      }

      const result = passwordResetConfirmSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject password without uppercase', () => {
      const invalidData = {
        token: 'valid-token-123',
        password: 'securepass123',
      }

      const result = passwordResetConfirmSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject password without lowercase', () => {
      const invalidData = {
        token: 'valid-token-123',
        password: 'SECUREPASS123',
      }

      const result = passwordResetConfirmSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject password without number', () => {
      const invalidData = {
        token: 'valid-token-123',
        password: 'SecurePass',
      }

      const result = passwordResetConfirmSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject password shorter than 8 characters', () => {
      const invalidData = {
        token: 'valid-token-123',
        password: 'Pass1',
      }

      const result = passwordResetConfirmSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('updateOrderSchema', () => {
    it('should validate partial update with ID', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'Updated notes',
      }

      const result = updateOrderSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject update without ID', () => {
      const invalidData = {
        notes: 'Updated notes',
      }

      const result = updateOrderSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })
})
