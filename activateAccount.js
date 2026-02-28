// activateAccount.js
const Stripe = require('stripe');
const stripe = Stripe('sk_test_51RFMCOCj9n8yDfExwnOrC8M2epPFFEPD6NlfPv8nNgFcZBxpMIGuqpPF7FIdmLGBVjXnAZ3lj71zwrQsMvZvMSfF009r21kCpc');

async function run() {
    // Use SSN 0000 triggers "pending", use full 000000000 triggers instant approval in test mode
    await stripe.accounts.update('acct_1T5bv1CZis48b9iE', {
        individual: {
            id_number: '000000000', // full 9-digit test SSN = instant approval
            ssn_last_4: '0000',
        },
    });

    // Wait a moment then check
    await new Promise(r => setTimeout(r, 2000));

    const account = await stripe.accounts.retrieve('acct_1T5bv1CZis48b9iE');
    console.log('Capabilities:', JSON.stringify(account.capabilities, null, 2));
    console.log('Still due:', JSON.stringify(account.requirements?.currently_due, null, 2));
    console.log('Errors:', JSON.stringify(account.requirements?.errors, null, 2));
}

run().catch(console.error);