/**
 * Stargaze — seller configuration.
 *
 * To start selling:
 * 1. Create a product on Gumroad (gumroad.com) priced at $50 with
 *    "Generate a unique license key per sale" enabled.
 * 2. Put the product's purchase URL in PAYMENT_LINK
 *    (e.g. 'https://yourname.gumroad.com/l/stargaze').
 * 3. Put the product permalink (the part after /l/) in GUMROAD_PERMALINK
 *    (e.g. 'stargaze') — the game verifies buyers' license keys with it.
 *
 * While PAYMENT_LINK is empty the game runs in free early-access mode:
 * no paywall is shown and the landing page says "early access".
 */
window.STARGAZE_CONFIG = {
  PAYMENT_LINK: '',
  GUMROAD_PERMALINK: '',
  PRICE: '$50',
  PREVIEW_LEVELS: 5, // levels playable before the unlock prompt (once selling)
};
