const Stripe = require('stripe');
const stripe = Stripe('sk_test_51RFMCOCj9n8yDfExwnOrC8M2epPFFEPD6NlfPv8nNgFcZBxpMIGuqpPF7FIdmLGBVjXnAZ3lj71zwrQsMvZvMSfF009r21kCpc');

async function run() {
    const pi = await stripe.paymentIntents.create({
        amount: 2000,
        currency: 'usd',
        confirm: true,
        payment_method: 'pm_card_visa',
        automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never', // ← fixes the error
        },
        transfer_data: {
            destination: 'acct_1T5bv1CZis48b9iE',
        },
    });
    console.log('Done:', pi.id, pi.status);
}

run().catch(console.error);