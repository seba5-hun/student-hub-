// Stripe tells MYND here when someone subscribes, renews, changes plan, fails a payment or cancels.
// Each time the subscription is read again from Stripe and saved in Supabase ("subscriptions"):
// that is what opens or closes the app for the user.
import { env, fail, json, requireConfig, saveSubscriptionRow, stripe, subscriptionRow, verifyStripeSignature } from './_billing.js';

const PAID = ['active', 'trialing', 'past_due'];

async function sync(subscriptionId, userHint) {
  const sub = await stripe('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const known = await subscriptionRow(`stripe_customer_id=eq.${encodeURIComponent(customer)}`);
  const userId = sub.metadata?.user_id || userHint || known?.user_id;
  if (!userId) { console.error('Abbonamento senza utente', sub.id); return; }
  const current = known?.user_id === userId ? known : await subscriptionRow(`user_id=eq.${userId}`);
  // An old subscription that ends must not close a newer one that is active.
  if (current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && PAID.includes(current.status) && !PAID.includes(sub.status)) return;
  const item = sub.items?.data?.[0];
  const end = sub.current_period_end || item?.current_period_end;
  await saveSubscriptionRow({
    user_id: userId,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan: item?.price?.recurring?.interval === 'year' ? 'annuale' : 'mensile',
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!(sub.cancel_at_period_end || sub.cancel_at),
  });
}

export async function POST(request) {
  try {
    requireConfig(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']);
    const raw = await request.text();
    if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'))) {
      return json({ error: 'Firma non valida' }, 400);
    }
    const event = JSON.parse(raw);
    const obj = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription' && obj.subscription) {
      await sync(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id, obj.client_reference_id || obj.metadata?.user_id);
    } else if (event.type?.startsWith('customer.subscription.')) {
      await sync(obj.id, obj.metadata?.user_id);
    }
    return json({ received: true });
  } catch (err) {
    // A non-2xx answer makes Stripe send the event again later.
    return fail(err);
  }
}
