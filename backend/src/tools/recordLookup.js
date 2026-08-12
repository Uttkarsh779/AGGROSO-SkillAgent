// Mock structured records — in-memory, deterministic
const RECORDS = {
  customers: {
    C101: {
      id: 'C101',
      name: 'Priya Sharma',
      email: 'priya.sharma@email.com',
      phone: '+91-9876543210',
      accountStatus: 'active',
      memberSince: '2022-03-15',
      totalOrders: 12,
    },
    C102: {
      id: 'C102',
      name: 'Arjun Mehta',
      email: 'arjun.mehta@email.com',
      phone: '+91-9123456789',
      accountStatus: 'active',
      memberSince: '2023-07-01',
      totalOrders: 3,
    },
    C103: {
      id: 'C103',
      name: 'Sneha Kulkarni',
      email: 'sneha.k@email.com',
      phone: '+91-9988776655',
      accountStatus: 'suspended',
      memberSince: '2021-11-20',
      totalOrders: 28,
    },
  },
  orders: {
    'ORD-2041': {
      id: 'ORD-2041',
      customerId: 'C101',
      status: 'delivered',
      total: 2499,
      currency: 'INR',
      items: ['Wireless Headphones'],
      createdAt: '2026-07-10',
      deliveredAt: '2026-07-13',
    },
    'ORD-2045': {
      id: 'ORD-2045',
      customerId: 'C102',
      status: 'payment_captured_order_failed',
      total: 1299,
      currency: 'INR',
      items: ['USB-C Hub'],
      createdAt: '2026-08-10',
      paymentStatus: 'captured',
      orderStatus: 'creation_failed',
      note: 'Payment was captured by gateway but order creation timed out',
    },
    'ORD-2046': {
      id: 'ORD-2046',
      customerId: 'C103',
      status: 'processing',
      total: 5999,
      currency: 'INR',
      items: ['Mechanical Keyboard', 'Mouse Pad'],
      createdAt: '2026-08-09',
    },
  },
  support_tickets: {
    'TKT-1001': {
      id: 'TKT-1001',
      customerId: 'C101',
      title: 'Order arrived damaged',
      priority: 'medium',
      status: 'resolved',
      createdAt: '2026-07-15',
      resolvedAt: '2026-07-17',
    },
    'TKT-1002': {
      id: 'TKT-1002',
      customerId: 'C102',
      title: 'Payment deducted but order not created',
      priority: 'high',
      status: 'open',
      createdAt: '2026-08-10',
      orderId: 'ORD-2045',
    },
  },
};

const ALLOWED_COLLECTIONS = Object.keys(RECORDS);

/**
 * Record Lookup tool
 *
 * Input:  { collection: string, id: string }
 * Output: { record: object | null }
 */
const recordLookup = {
  name: 'record_lookup',
  description:
    'Looks up a structured record from the internal database. ' +
    `Available collections: ${ALLOWED_COLLECTIONS.join(', ')}. ` +
    'Use this to retrieve customer details, order information, or support tickets.',
  readWrite: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        enum: ALLOWED_COLLECTIONS,
        description: 'The collection to search in',
      },
      id: {
        type: 'string',
        description: 'The record ID to look up',
      },
    },
    required: ['collection', 'id'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      record: { type: 'object' },
      found: { type: 'boolean' },
    },
  },

  async execute(args = {}) {
    let collection = args.collection;
    let id = args.id || args.customerId || args.orderId || args.ticketId;

    // Smart inference: derive collection from ID prefix if omitted
    if (!collection && id) {
      const idStr = String(id).toUpperCase();
      if (idStr.startsWith('TKT'))      collection = 'support_tickets';
      else if (idStr.startsWith('ORD')) collection = 'orders';
      else if (idStr.startsWith('C'))   collection = 'customers';
      else                              collection = 'customers';
    }

    if (!collection || !id) {
      // Return as data so Gemini can self-correct its arguments
      return {
        found: false,
        error: 'Both collection and id are required. ' +
          `Available collections: ${ALLOWED_COLLECTIONS.join(', ')}. ` +
          'Example: {"collection": "customers", "id": "C102"}',
      };
    }

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return {
        found: false,
        error: `Collection "${collection}" is not available. ` +
          `Allowed collections: ${ALLOWED_COLLECTIONS.join(', ')}`,
      };
    }

    const record = RECORDS[collection][id] || null;
    return { collection, id, record, found: record !== null };
  },
};

module.exports = recordLookup;
