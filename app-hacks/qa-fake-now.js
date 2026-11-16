// LOCAL QA HACK, never commit to the app. Copy to the app root and make
// `import './qa-fake-now';` the first line of App.tsx.
//
// Pins the JS clock to EXPO_PUBLIC_FAKE_NOW (time still passes from there), so
// the app on any device, and the mock started with the same FAKE_NOW, agree on
// "now" without touching the device's system clock.
const FAKE_NOW = process.env.EXPO_PUBLIC_FAKE_NOW;
if (FAKE_NOW) {
  const RealDate = Date;
  const offset = RealDate.parse(FAKE_NOW) - RealDate.now();
  if (Number.isNaN(offset)) throw new Error('EXPO_PUBLIC_FAKE_NOW must be an ISO time');
  function FakeDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString();
    return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + offset);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => RealDate.now() + offset;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  globalThis.Date = FakeDate;
}
