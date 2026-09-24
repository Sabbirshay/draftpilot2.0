import { validateTeamPrice } from "./billing-policy";
import {
  Controller,
  Post,
  Req,
  UseGuards,
  ServiceUnavailableException,
  BadRequestException,
  Headers,
  RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import Stripe from "stripe";
import {
  AuthGuard,
  AuthRequest,
  requireTeam,
  requireRole,
  audit,
} from "./auth";
import { config, serviceDb } from "./config";
import { checked, found } from "./validation";
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ServiceUnavailableException("Billing is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 10000,
  });
}
@Controller("billing")
export class BillingController {
  client() {
    return stripe();
  }
  @Post("checkout") @UseGuards(AuthGuard) async checkout(
    @Req() req: AuthRequest,
  ) {
    requireRole(req, ["owner"]);
    if (!process.env.STRIPE_TEAM_PRICE_ID)
      throw new ServiceUnavailableException(
        "Team plan pricing is not configured.",
      );
    const db = serviceDb(),
      team = found(
        await db
          .from("teams")
          .select("id,name,stripe_customer_id,stripe_subscription_id")
          .eq("id", requireTeam(req))
          .single(),
      ),
      client = this.client();
    validateTeamPrice(
      await client.prices.retrieve(process.env.STRIPE_TEAM_PRICE_ID),
    );
    if (team.stripe_subscription_id)
      throw new BadRequestException(
        "Use Manage subscription for an existing plan.",
      );
    let customer = team.stripe_customer_id;
    if (!customer) {
      const created = await client.customers.create(
        {
          email: req.principal.email,
          name: team.name,
          metadata: { team_id: team.id },
        },
        { idempotencyKey: "team-customer-" + team.id },
      );
      customer = created.id;
      checked(
        await db
          .from("teams")
          .update({ stripe_customer_id: customer })
          .eq("id", team.id)
          .is("stripe_customer_id", null),
      );
    }
    await audit(req, "billing.checkout");
    const session = await client.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        line_items: [
          {
            price: process.env.STRIPE_TEAM_PRICE_ID,
            quantity: 1,
            adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 },
          },
        ],
        client_reference_id: team.id,
        subscription_data: { metadata: { team_id: team.id } },
        success_url: config.appUrl + "/?billing=success",
        cancel_url: config.appUrl + "/?billing=cancelled",
        allow_promotion_codes: true,
      },
      {
        idempotencyKey:
          "checkout-" + team.id + "-" + Math.floor(Date.now() / 600000),
      },
    );
    return { url: session.url };
  }
  @Post("portal") @UseGuards(AuthGuard) async portal(@Req() req: AuthRequest) {
    requireRole(req, ["owner"]);
    const team = found(
      await serviceDb()
        .from("teams")
        .select("stripe_customer_id")
        .eq("id", requireTeam(req))
        .single(),
    );
    if (!team.stripe_customer_id)
      throw new BadRequestException("No billing account exists yet.");
    const session = await this.client().billingPortal.sessions.create({
      customer: team.stripe_customer_id,
      return_url: config.appUrl,
    });
    return { url: session.url };
  }
  @Post("webhook") async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ServiceUnavailableException("Webhook is not configured.");
    let event: Stripe.Event;
    const client = this.client();
    try {
      if (!req.rawBody || !signature) throw new Error();
      event = client.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new BadRequestException("Invalid webhook signature.");
    }
    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    ) {
      const payload = event.data.object as Stripe.Subscription;
      // Fetch authoritative state to tolerate duplicate and out-of-order deliveries.
      const subscription =
        event.type === "customer.subscription.deleted"
          ? payload
          : await client.subscriptions.retrieve(payload.id);
      const item = subscription.items.data.find(
        (i) => i.price.id === process.env.STRIPE_TEAM_PRICE_ID,
      );
      const active =
        ["active", "trialing"].includes(subscription.status) && !!item;
      checked(
        await serviceDb().rpc("apply_subscription", {
          p_event: event.id,
          p_created: event.created,
          p_customer:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
          p_subscription: subscription.id,
          p_active: active,
          p_seats: item?.quantity || 1,
        }),
      );
    }
    return { received: true };
  }
}
