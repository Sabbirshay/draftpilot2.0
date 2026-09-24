import type Stripe from "stripe";
import { ServiceUnavailableException } from "@nestjs/common";
export function validateTeamPrice(price: Stripe.Price) {
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== 1900 ||
    price.billing_scheme !== "per_unit" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  )
    throw new ServiceUnavailableException(
      "Configured Team price must be $19 USD per licensed seat per month.",
    );
}
