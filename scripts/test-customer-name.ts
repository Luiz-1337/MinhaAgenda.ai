import { db, customers } from '@repo/db';
import { eq, and } from 'drizzle-orm';
import { findOrCreateCustomer } from '../apps/web/lib/services/chat.service';
import * as dotenv from 'dotenv';

// Fallback to root .env
dotenv.config({ path: '.env' });

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 15) + '...');
    console.log('DATABASE_URL length:', process.env.DATABASE_URL.length);
}

const TEST_PHONE_1 = '+5511999999991';
const TEST_PHONE_2 = '+5511999999992';
const SALON_ID = 'test-salon-id'; // We might need a real salon ID. Let's fetch one.

async function main() {
    console.log('🧪 Testing findOrCreateCustomer logic...');

    // 0. Get a real salon ID
    const salon = await db.query.salons.findFirst();
    if (!salon) {
        console.error('❌ No salon found in DB. Cannot test.');
        process.exit(1);
    }
    const salonId = salon.id;
    console.log(`Using salon: ${salon.name} (${salonId})`);

    try {
        // TEST 1: New customer WITH pushName
        console.log('\nTest 1: New customer WITH pushName');
        // Cleanup first
        await db.delete(customers).where(and(eq(customers.phone, TEST_PHONE_1.replace(/\D/g, '')), eq(customers.salonId, salonId)));

        const res1 = await findOrCreateCustomer(TEST_PHONE_1, salonId, 'Test User 1');
        console.log('Result 1:', res1);

        if (res1.name === 'Test User 1') {
            console.log('✅ Name correctly set to pushName');
        } else {
            console.error('❌ Name NOT set to pushName');
        }

        // TEST 2: Existing customer (generic) gets updated
        console.log('\nTest 2: Existing legacy customer (generic name) gets updated');
        // Cleanup first
        await db.delete(customers).where(and(eq(customers.phone, TEST_PHONE_2.replace(/\D/g, '')), eq(customers.salonId, salonId)));

        // Create manually with generic name
        await db.insert(customers).values({
            salonId,
            phone: TEST_PHONE_2.replace(/\D/g, ''),
            name: 'Cliente 12345'
        });

        const res2 = await findOrCreateCustomer(TEST_PHONE_2, salonId, 'Updated Name');
        console.log('Result 2:', res2);

        if (res2.name === 'Updated Name') {
            console.log('✅ Generic name (Cliente 12345) correctly updated to pushName');
        } else {
            console.error('❌ Generic name NOT updated');
        }

        // TEST 3: Existing specific name does NOT get updated
        console.log('\nTest 3: Existing specific name does NOT get updated');
        const res3 = await findOrCreateCustomer(TEST_PHONE_1, salonId, 'Should Not Update');
        console.log('Result 3:', res3);

        if (res3.name === 'Test User 1') {
            console.log('✅ Specific name correctly preserved');
        } else {
            console.error('❌ Specific name WAS updated (unexpected)');
        }


    } catch (err) {
        console.error('❌ Error during test:', err);
    } finally {
        // Cleanup
        console.log('\nCleaning up...');
        await db.delete(customers).where(and(eq(customers.phone, TEST_PHONE_1.replace(/\D/g, '')), eq(customers.salonId, salonId)));
        await db.delete(customers).where(and(eq(customers.phone, TEST_PHONE_2.replace(/\D/g, '')), eq(customers.salonId, salonId)));
    }
}

main();
