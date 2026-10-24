// "Abbonati": opens Stripe's payment page (card, Apple Pay, Google Pay, Link… the methods turned on
// in the Stripe Dashboard) for the logged-in user, with the plan chosen in the app.
import { HttpError, accessOf, appOrigin, currentUser, env, fail, json, requireConfig, saveSubscriptionRow, stripe, subscriptionRow } from './_billing.js';

const PLANS = {
  mensile: { interval: 'month', priceEnv: 'STRIPE_PRICE_MENSILE', cents: a => a.price_month_cents, name: 'MYND · abbonamento mensile' },
  annuale: { interval: 'year', priceEnv: 'STRIPE_PRICE_ANNUALE', cents: a => a.price_year_cents, name: 'MYND · abbonamento annuale' },
};
const PAID = ['active', 'trialing', 'past_due'];

// The Stripe price of a plan: the one set on Vercel, otherwise created once by MYND with the
// amount chosen in the Admin panel (and found again by its "lookup key").
async function priceFor(plan, access) {
  const p = PLANS[plan];
  if (env(p.priceEnv)) return env(p.priceEnv);
  const cents = p.cents(access);
  const key = `mynd_${plan}_${cents}`;
  const found = await stripe('GET', '/prices', { lookup_keys: [key], active: 'true', limit: 1 });
  if (found.data?.[0]) return found.data[0].id;
  const created = await stripe('POST', '/prices', {
    currency: 'eur', unit_amount: cents, recurring: { interval: p.interval }, lookup_key: key, tax_behavior: 'inclusive',
    product_data: { name: p.name },
  });
  return created.id;
}

export async function POST(request) {
  try {
    requireConfig(['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await currentUser(request);
    const { plan } = await request.json().catch(() => ({}));
    if (!PLANS[plan]) throw new HttpError(400, 'Scegli il piano mensile o annuale.');
    const access = await accessOf(user);
    if (PAID.includes(access.status)) throw new HttpError(409, 'Hai già un abbonamento attivo: lo trovi in Account → Abbonamento.');

    const row = await subscriptionRow(`user_id=eq.${user.id}`);
    let customer = row?.stripe_customer_id;
    if (!customer) {
      customer = (await stripe('POST', '/customers', { email: user.email, metadata: { user_id: user.id } })).id;
      await saveSubscriptionRow({ user_id: user.id, stripe_customer_id: customer });
    }

    // Who still has free days (trial or a code for some months) pays only when they end.
    const now = Date.now() / 1000;
    const freeUntil = Math.max(
      access.trial_end ? Date.parse(access.trial_end) / 1000 : 0,
      access.code_until ? Date.parse(access.code_until) / 1000 : 0,
    );
    const trialEnd = access.enabled && freeUntil > now + 49 * 3600 ? Math.min(Math.floor(freeUntil), Math.floor(now + 720 * 86400)) : undefined;

    const origin = appOrigin(request);
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price: await priceFor(plan, access), quantity: 1 }],
      allow_promotion_codes: 'true',
      locale: 'it',
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      success_url: `${origin}/?abbonamento=ok`,
      cancel_url: `${origin}/?abbonamento=annullato`,
    });
    return json({ url: session.url });
  } catch (err) {
    return fail(err);
  }
}
