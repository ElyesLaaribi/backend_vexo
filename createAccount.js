// createAccount.js
const Stripe = require('stripe');
const stripe = Stripe('sk_test_51RFMCOCj9n8yDfExwnOrC8M2epPFFEPD6NlfPv8nNgFcZBxpMIGuqpPF7FIdmLGBVjXnAZ3lj71zwrQsMvZvMSfF009r21kCpc');

async function run() {
  // Step 1: Create a CUSTOM account (allows full programmatic control)
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'US',
    email: 'test-seller@example.com',
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
  });
  console.log('Account created:', account.id);

  // Step 2: Update with all required info
  await stripe.accounts.update(account.id, {
    business_type: 'individual',
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
    individual: {
      first_name: 'Test',
      last_name: 'User',
      dob: { day: 1, month: 1, year: 1901 },
      ssn_last_4: '0000',
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US',
      },
    },
    external_account: {
      object: 'bank_account',
      country: 'US',
      currency: 'usd',
      routing_number: '110000000',
      account_number: '000123456789',
    },
  });

  console.log('Done! Account ID to use:', account.id);
  console.log('Now run: db.users.updateOne({ email: "your-user" }, { $set: { stripeAccountId: "' + account.id + '" } })');
}

run().catch(console.error);