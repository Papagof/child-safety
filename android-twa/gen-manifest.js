const { TwaManifest, fetchUtils } = require("@bubblewrap/core");

// Default fetch-h2 engine gets an HTML (not JSON) response from Hostinger's
// CDN for reasons unconfirmed (possibly its HTTP/2 negotiation or spoofed
// old-Firefox user agent tripping something on the CDN/WAF side) — plain
// node-fetch works fine against the same URL.
fetchUtils.setFetchEngine("node-fetch");

(async () => {
  const manifest = await TwaManifest.fromWebManifest("https://shmeera.com/manifest.json");
  manifest.packageId = "com.shmeera.app";
  manifest.signingKey = { path: "./android.keystore", alias: "shmeera" };
  manifest.appVersionName = "1";
  manifest.appVersionCode = 1;
  await manifest.saveToFile("./twa-manifest.json");
  console.log("Wrote twa-manifest.json");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
