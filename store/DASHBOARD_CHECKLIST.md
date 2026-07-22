# Chrome Web Store Dashboard Checklist

These steps require a maintainer in the Chrome Web Store dashboard and are not
performed by the release scripts.

## Version 1.0.10 Coordination

- [ ] Leave the previously submitted Chrome Web Store version 1.0.0 and the immutable 1.0.0, 1.0.1, 1.0.2, 1.0.3, and 1.0.4 GitHub artifacts unchanged.
- [ ] Confirm `manifest.json` and the popup both show version 1.0.10.
- [ ] Confirm the GitHub `v1.0.10` release is immutable and its tag resolves to the reviewed release commit.
- [ ] Confirm the matching Chunes desktop release supports protocol 4 and clearly states whether its MSI is signed or unsigned manual-only.
- [ ] Confirm the `scripting` permission and SoundCloud, YouTube Music, and Apple Music metadata readers are covered in `store/PERMISSION_JUSTIFICATIONS.md` and the reviewer notes.

## Package

- [ ] Run `scripts/validate.ps1`, `scripts/package.ps1`, and `scripts/validate-package.ps1` from the repository root.
- [ ] Upload `dist/chune-id-1.0.10.zip` and confirm the dashboard detects Manifest V3, version 1.0.10, and minimum Chrome version 120.
- [ ] Confirm the upload ZIP SHA-256 is `4f5f9dc3e957e747da7637557c5ccd07757b8e32ba66468c4af1c1ecce67812f` and matches the reviewed 1.0.10 GitHub release asset digest.

## Store Listing

- [ ] Paste the product name, summary, and detailed description from `store/LISTING.md`.
- [ ] Select primary language **English** and category **Social & Communication**.
- [ ] Upload `icons/icon-128.png` as the store icon.
- [ ] Upload `store/assets/store-promo-440x280.png` as the small promo tile.
- [ ] Upload `store/screenshots/popup-1280x800.png` as the screenshot.
- [ ] Preview the listing at desktop and narrow widths and confirm every asset is sharp and uncropped.

## Privacy

- [ ] Paste the single-purpose statement and data answers from `store/PRIVACY_DISCLOSURES.md`.
- [ ] Disclose **Web history** and **Website content**; leave unsupported data categories unselected.
- [ ] Certify no sale, unrelated use/transfer, or credit/lending use of user data.
- [ ] Answer **No** for remote code.
- [ ] Enter `https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md` as the privacy policy URL.
- [ ] Link `https://github.com/getchunes/chunes/blob/main/PRIVACY.md` wherever companion privacy or downstream behavior can be explained.
- [ ] Confirm disclosures distinguish direct local extension traffic from Chunes sending enabled presence to Discord and optional provider-specific SoundCloud, YouTube Music, or Apple Music album-art requests.
- [ ] Confirm the privacy policy is publicly reachable from a signed-out browser after these files reach the repository's default branch.

## Permissions And Review

- [ ] Paste each field from `store/PERMISSION_JUSTIFICATIONS.md` without broadening the stated purpose.
- [ ] Paste `store/REVIEWER_NOTES.md` into the reviewer instructions and include the companion MSI URL.
- [ ] Enter `https://github.com/getchunes/chunes-extension/issues` as the support URL and verify it is public.
- [ ] Confirm no account or test credentials are required.

## Distribution

- [ ] Select **Public** visibility and all intended Chrome Web Store regions.
- [ ] State prominently that the companion app is currently Windows-only.
- [ ] Save a final dashboard preview, submit for review, and record the assigned item ID for the eventual README/store-link update.
