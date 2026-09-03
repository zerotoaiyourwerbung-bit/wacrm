import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  runAutomationsForTrigger: vi.fn(),
  findOrCreateContact: vi.fn(),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: mocks.from,
  }),
}))

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: mocks.runAutomationsForTrigger,
}))

vi.mock('@/lib/api/v1/contacts', () => ({
  findOrCreateContact: mocks.findOrCreateContact,
}))

import { GET, POST } from './route'

describe('GET /api/automations/webhook/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when automation does not exist', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })

    const req = new Request('http://localhost:3000/api/automations/webhook/auto-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'auto-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with automation details when found', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'auto-1',
              name: 'Order Webhook',
              is_active: true,
              trigger_type: 'webhook_received',
            },
            error: null,
          }),
        }),
      }),
    })

    const req = new Request('http://localhost:3000/api/automations/webhook/auto-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'auto-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.automation_id).toBe('auto-1')
  })
})

describe('POST /api/automations/webhook/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns status captured when automation is inactive', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'auto-1',
              is_active: false,
              trigger_type: 'webhook_received',
              trigger_config: {},
            },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve(),
      }),
    })

    const req = new Request('http://localhost:3000/api/automations/webhook/auto-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '15551234567' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'auto-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('captured')
    expect(json.message).toContain('Active')
  })

  it('returns 401 when secret token does not match', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'auto-1',
              is_active: true,
              trigger_type: 'webhook_received',
              trigger_config: { secret: 'super-secret-123' },
            },
            error: null,
          }),
        }),
      }),
    })

    const req = new Request('http://localhost:3000/api/automations/webhook/auto-1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'wrong-secret',
      },
      body: JSON.stringify({ phone: '15551234567' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'auto-1' }) })
    expect(res.status).toBe(401)
  })

  it('successfully resolves contact and triggers automation on valid payload', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'automations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'auto-1',
                  account_id: 'acc-1',
                  user_id: 'user-1',
                  name: 'New Lead Webhook',
                  is_active: true,
                  trigger_type: 'webhook_received',
                  trigger_config: {
                    phoneField: 'customer.mobile',
                    nameField: 'customer.name',
                  },
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve(),
          }),
        }
      }
      return {}
    })

    mocks.findOrCreateContact.mockResolvedValue({ id: 'contact-999', created: true })

    const req = new Request('http://localhost:3000/api/automations/webhook/auto-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          mobile: '+15551234567',
          name: 'Jane Doe',
        },
        order_id: 'ORD-555',
        amount: '$99.00',
      }),
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'auto-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.contact_id).toBe('contact-999')

    expect(mocks.findOrCreateContact).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      'user-1',
      expect.objectContaining({
        phone: '15551234567',
        name: 'Jane Doe',
      })
    )

    expect(mocks.runAutomationsForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        triggerType: 'webhook_received',
        contactId: 'contact-999',
        context: expect.objectContaining({
          vars: expect.objectContaining({
            order_id: 'ORD-555',
            amount: '$99.00',
          }),
        }),
      })
    )
  })
})
