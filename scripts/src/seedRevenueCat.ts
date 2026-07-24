import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Chip Forge AI";

const PRODUCT_IDENTIFIER = "chipforge_pro_monthly";
const PLAY_STORE_PRODUCT_IDENTIFIER = "chipforge_pro_monthly:monthly";

const PRODUCT_DISPLAY_NAME = "ChipForge Pro Monthly";
const PRODUCT_USER_FACING_TITLE = "ChipForge Pro";
const PRODUCT_DURATION = "P1M";

const APP_STORE_APP_NAME = "Chip Forge AI iOS";
const APP_STORE_BUNDLE_ID = "com.chipforgeai.app";
const PLAY_STORE_APP_NAME = "Chip Forge AI Android";
const PLAY_STORE_PACKAGE_NAME = "com.chipforgeai.app";

const ENTITLEMENT_IDENTIFIER = "pro";
const ENTITLEMENT_DISPLAY_NAME = "Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

const PACKAGE_IDENTIFIER = "$rc_monthly";
const PACKAGE_DISPLAY_NAME = "Monthly";

// $14.99/month — competitive for professional PCB/chip design tooling
const PRODUCT_PRICES = [
  { amount_micros: 14990000, currency: "USD" }, // $14.99
  { amount_micros: 13990000, currency: "EUR" }, // €13.99
  { amount_micros: 11990000, currency: "GBP" }, // £11.99
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");

  // Use existing project by name, or fall back to first available
  // (token may be project-scoped and block creation of new ones)
  const existingProject =
    existingProjects.items?.find((p) => p.name === PROJECT_NAME) ??
    existingProjects.items?.[0];

  if (existingProject) {
    console.log("Using project:", existingProject.id, `(${existingProject.name})`);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // ── Apps ─────────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps) throw new Error("Failed to list apps");

  // Note: test_store apps are auto-provisioned by RevenueCat and cannot be
  // created manually. We use the iOS key for dev/Expo Go testing instead.
  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find(
    (a) => a.type === "app_store" && a.name === APP_STORE_APP_NAME,
  );
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (testStoreApp) {
    console.log("Test Store app:", testStoreApp.id);
  } else {
    console.log("No test store app (will use iOS key for dev testing)");
  }

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app: " + JSON.stringify(error));
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // ── Products ──────────────────────────────────────────────────────────────
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    storeId: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeId && p.app_id === targetApp.id,
    );
    if (existing) { console.log(label + " product exists:", existing.id); return existing; }

    const body: CreateProductData["body"] = {
      store_identifier: storeId,
      app_id: targetApp.id,
      type: "subscription",
      display_name: PRODUCT_DISPLAY_NAME,
    };
    if (isTestStore) {
      body.subscription = { duration: PRODUCT_DURATION };
      body.title = PRODUCT_USER_FACING_TITLE;
    }

    const { data: created, error } = await createProduct({ client, path: { project_id: project.id }, body });
    if (error) throw new Error("Failed to create " + label + " product: " + JSON.stringify(error));
    console.log("Created " + label + " product:", created.id);
    return created;
  };

  const appsForProducts: Array<[App, string, string, boolean]> = [
    [appStoreApp, "App Store", PRODUCT_IDENTIFIER, false],
    [playStoreApp, "Play Store", PLAY_STORE_PRODUCT_IDENTIFIER, false],
  ];
  if (testStoreApp) {
    appsForProducts.unshift([testStoreApp, "Test Store", PRODUCT_IDENTIFIER, true]);
  }

  let testOrIosProduct: Product;
  let iosProduct: Product;
  let androidProduct: Product;

  if (testStoreApp) {
    [testOrIosProduct, iosProduct, androidProduct] = await Promise.all([
      ensureProduct(testStoreApp, "Test Store", PRODUCT_IDENTIFIER, true),
      ensureProduct(appStoreApp, "App Store", PRODUCT_IDENTIFIER, false),
      ensureProduct(playStoreApp, "Play Store", PLAY_STORE_PRODUCT_IDENTIFIER, false),
    ]);
  } else {
    // No test store — create iOS + Android products; use iOS product as the dev/test key source
    [iosProduct, androidProduct] = await Promise.all([
      ensureProduct(appStoreApp, "App Store", PRODUCT_IDENTIFIER, false),
      ensureProduct(playStoreApp, "Play Store", PLAY_STORE_PRODUCT_IDENTIFIER, false),
    ]);
    testOrIosProduct = iosProduct;
  }

  // Test store prices (only if test store app exists)
  if (testStoreApp && testOrIosProduct) {
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: testOrIosProduct.id },
      body: { prices: PRODUCT_PRICES },
    });
    if (priceError) {
      if (typeof priceError === "object" && "type" in priceError && priceError["type"] === "resource_already_exists") {
        console.log("Test store prices already exist");
      } else {
        throw new Error("Failed to add test store prices: " + JSON.stringify(priceError));
      }
    } else {
      console.log("Added test store prices");
    }
  }

  // ── Entitlement ───────────────────────────────────────────────────────────
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEntitlement) {
    console.log("Entitlement exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEnt, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEnt.id);
    entitlement = newEnt;
  }

  const productIdsToAttach = Array.from(new Set([testOrIosProduct.id, iosProduct.id, androidProduct.id]));
  const { error: attachEntError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: productIdsToAttach },
  });
  if (attachEntError && attachEntError.type !== "unprocessable_entity_error") {
    throw new Error("Failed to attach products to entitlement");
  }
  console.log("Products attached to entitlement");

  // ── Offering ──────────────────────────────────────────────────────────────
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOffering) {
    console.log("Offering exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOff, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOff.id);
    offering = newOff;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // ── Package ───────────────────────────────────────────────────────────────
  let pkg: Package;
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  const existingPackage = existingPackages.items?.find((p) => p.lookup_key === PACKAGE_IDENTIFIER);
  if (existingPackage) {
    console.log("Package exists:", existingPackage.id);
    pkg = existingPackage;
  } else {
    const { data: newPkg, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: PACKAGE_IDENTIFIER, display_name: PACKAGE_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create package");
    console.log("Created package:", newPkg.id);
    pkg = newPkg;
  }

  const productsToAttachToPkg = Array.from(
    new Set([testOrIosProduct.id, iosProduct.id, androidProduct.id]),
  ).map((id) => ({ product_id: id, eligibility_criteria: "all" as const }));

  const { error: attachPkgError } = await attachProductsToPackage({
    client,
    path: { project_id: project.id, package_id: pkg.id },
    body: { products: productsToAttachToPkg },
  });
  if (attachPkgError) {
    if (
      attachPkgError.type === "unprocessable_entity_error" &&
      attachPkgError.message?.includes("Cannot attach product")
    ) {
      console.log("Skipping package attach: already has incompatible product");
    } else {
      throw new Error("Failed to attach products to package: " + JSON.stringify(attachPkgError));
    }
  } else {
    console.log("Attached products to package");
  }

  // ── API keys ──────────────────────────────────────────────────────────────
  const [{ data: iosKeys }, { data: androidKeys }] = await Promise.all([
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: playStoreApp.id } }),
  ]);

  let testKeys: typeof iosKeys = undefined;
  if (testStoreApp) {
    const { data } = await listAppPublicApiKeys({
      client,
      path: { project_id: project.id, app_id: testStoreApp.id },
    });
    testKeys = data;
  }

  const iosKey = iosKeys?.items[0]?.key ?? "N/A";
  const testKey = testKeys?.items[0]?.key ?? iosKey; // fall back to iOS key for dev testing

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:              ", project.id);
  console.log("App Store App ID:        ", appStoreApp.id);
  console.log("Play Store App ID:       ", playStoreApp.id);
  if (testStoreApp) console.log("Test Store App ID:       ", testStoreApp.id);
  console.log("Entitlement Identifier:  ", ENTITLEMENT_IDENTIFIER);
  console.log("Public API Key (Test):   ", testKey);
  console.log("Public API Key (iOS):    ", iosKey);
  console.log("Public API Key (Android):", androidKeys?.items[0]?.key ?? "N/A");
  console.log("====================");
  console.log("\nAdd these to your environment variables:");
  console.log("REVENUECAT_PROJECT_ID=" + project.id);
  if (testStoreApp) console.log("REVENUECAT_TEST_STORE_APP_ID=" + testStoreApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID=" + appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID=" + playStoreApp.id);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=" + testKey);
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=" + iosKey);
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=" + (androidKeys?.items[0]?.key ?? "N/A"));
  console.log("====================\n");
}

seedRevenueCat().catch(console.error);
