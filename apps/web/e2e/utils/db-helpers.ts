/**
 * Database helpers for E2E tests
 * 
 * Provides utilities for:
 * - Creating test data (salons, customers, chats, etc.)
 * - Cleaning up test data
 * - Querying test data
 */

// Note: These helpers connect directly to the test database
// In a real implementation, you would use your actual DB client

/**
 * Test salon data structure
 */
export interface TestSalon {
  id: string;
  name: string;
  whatsappNumber: string;
  ownerId: string;
  agentId: string;
}

/**
 * Test customer data structure
 */
export interface TestCustomer {
  id: string;
  name: string;
  phone: string;
  salonId: string;
}

/**
 * Test chat data structure
 */
export interface TestChat {
  id: string;
  clientPhone: string;
  salonId: string;
  status: string;
  isManual: boolean;
}

// In-memory storage for test data (to track what to cleanup)
const createdSalons: string[] = [];
const createdCustomers: string[] = [];
const createdChats: string[] = [];

// Test data counters for unique IDs
let salonCounter = 0;
let customerCounter = 0;

/**
 * Sets up the test database
 * Creates necessary test fixtures
 */
export async function setupTestDatabase(): Promise<void> {
  // In a real implementation, you would:
  // 1. Run migrations if needed
  // 2. Seed initial data
  // 3. Create test user accounts
  
  // For now, we just ensure the DB is accessible
  console.log("   Setting up test database...");
}

/**
 * Cleans up the test database
 * Removes all test data
 */
export async function cleanupTestDatabase(): Promise<void> {
  // In a real implementation, you would:
  // 1. Delete all test records
  // 2. Reset sequences if needed
  
  // Clear tracking arrays
  createdSalons.length = 0;
  createdCustomers.length = 0;
  createdChats.length = 0;
}

/**
 * Creates a test salon with an active agent
 */
export async function createTestSalon(
  options?: Partial<TestSalon>
): Promise<TestSalon> {
  salonCounter++;
  
  const salon: TestSalon = {
    id: options?.id || `test-salon-${salonCounter}-${Date.now()}`,
    name: options?.name || `Test Salon ${salonCounter}`,
    whatsappNumber: options?.whatsappNumber || `+5511888888${String(salonCounter).padStart(3, "0")}`,
    ownerId: options?.ownerId || `test-owner-${salonCounter}`,
    agentId: options?.agentId || `test-agent-${salonCounter}`,
  };

  // In a real implementation, you would insert into the database:
  // await db.insert(salons).values({ ... });
  // await db.insert(agents).values({ ... });

  createdSalons.push(salon.id);
  
  return salon;
}

/**
 * Creates a test customer
 */
export async function createTestCustomer(
  salonId: string,
  options?: Partial<TestCustomer>
): Promise<TestCustomer> {
  customerCounter++;
  
  const phone = options?.phone || `+5511999999${String(customerCounter).padStart(3, "0")}`;
  
  const customer: TestCustomer = {
    id: options?.id || `test-customer-${customerCounter}-${Date.now()}`,
    name: options?.name || `Test Customer ${customerCounter}`,
    phone: phone.replace(/\D/g, ""), // Normalize phone
    salonId,
  };

  // In a real implementation, you would insert into the database:
  // await db.insert(customers).values({ ... });

  createdCustomers.push(customer.id);
  
  return customer;
}

/**
 * Creates a test chat
 */
export async function createTestChat(
  salonId: string,
  clientPhone: string,
  options?: Partial<TestChat>
): Promise<TestChat> {
  const chat: TestChat = {
    id: options?.id || `test-chat-${Date.now()}`,
    clientPhone,
    salonId,
    status: options?.status || "active",
    isManual: options?.isManual || false,
  };

  // In a real implementation, you would insert into the database:
  // await db.insert(chats).values({ ... });

  createdChats.push(chat.id);
  
  return chat;
}

/**
 * Sets a chat to manual mode
 */
export async function setChatManualMode(
  chatId: string,
  isManual: boolean
): Promise<void> {
  // In a real implementation:
  // await db.update(chats).set({ isManual }).where(eq(chats.id, chatId));
}

/**
 * Gets messages for a chat
 */
export async function getChatMessages(
  chatId: string
): Promise<Array<{ role: string; content: string }>> {
  // In a real implementation:
  // return db.query.messages.findMany({ where: eq(messages.chatId, chatId) });
  return [];
}

/**
 * Gets the last message for a chat
 */
export async function getLastMessage(
  chatId: string
): Promise<{ role: string; content: string } | null> {
  const messages = await getChatMessages(chatId);
  return messages[messages.length - 1] || null;
}

/**
 * Cleans up all test data created during tests
 */
export async function cleanupTestData(): Promise<void> {
  // In a real implementation, you would delete test records:
  // await db.delete(messages).where(inArray(messages.chatId, createdChats));
  // await db.delete(chats).where(inArray(chats.id, createdChats));
  // await db.delete(customers).where(inArray(customers.id, createdCustomers));
  // await db.delete(agents).where(...);
  // await db.delete(salons).where(inArray(salons.id, createdSalons));

  // Clear tracking arrays
  createdSalons.length = 0;
  createdCustomers.length = 0;
  createdChats.length = 0;
}

/**
 * Waits for a message to appear in the chat
 * Useful for testing async processing
 */
export async function waitForMessage(
  chatId: string,
  role: "user" | "assistant",
  timeout = 10000
): Promise<{ role: string; content: string } | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const messages = await getChatMessages(chatId);
    const message = messages.reverse().find((m) => m.role === role);
    
    if (message) {
      return message;
    }
    
    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  return null;
}

/**
 * Creates a complete test environment with salon, agent, and customer
 */
export async function createTestEnvironment(): Promise<{
  salon: TestSalon;
  customer: TestCustomer;
  chat: TestChat;
}> {
  const salon = await createTestSalon();
  const customer = await createTestCustomer(salon.id);
  const chat = await createTestChat(salon.id, customer.phone);
  
  return { salon, customer, chat };
}
