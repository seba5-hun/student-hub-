// "Gestisci abbonamento": Stripe's page to change card, switch plan, see receipts or cancel.
import { HttpError, appOrigin, currentUser, fail, json, requireConfig, stripe, subscriptionRow } from './_billing.js';

export async function POST(request) {
  try {
    requireConfig(['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await currentUser(request);
    const row = await subscriptionRow(`user_id=eq.${user.id}`);
    if (!row?.stripe_customer_id) throw new HttpError(404, 'Non hai ancora un abbonamento da gestire.');
    const session = await stripe('POST', '/billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${appOrigin(request)}/?abbonamento=gestito`, locale: 'it' });
    return json({ url: session.url });
  } catch (err) {
    return fail(err);
  }
}
