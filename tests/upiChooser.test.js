const assert = require('assert');

// Test UPI App URL generator logic across platforms
function generateTargetedUpiUrl(appName, baseUpiUri, platform = 'android') {
  if (!baseUpiUri) return '';
  const queryString = baseUpiUri.includes('?') ? baseUpiUri.substring(baseUpiUri.indexOf('?') + 1) : '';
  if (!queryString) return baseUpiUri;

  const isAndroid = platform === 'android';
  const isIOS = platform === 'ios';

  const packages = {
    gpay: 'com.google.android.apps.nbu.paisa.user',
    phonepe: 'com.phonepe.app',
    paytm: 'net.one97.paytm',
    bhim: 'in.org.npci.upiapp',
    whatsapp: 'com.whatsapp'
  };

  const iosSchemes = {
    gpay: 'gpay://upi/pay?',
    phonepe: 'phonepe://pay?',
    paytm: 'paytmmp://pay?',
    bhim: 'bhim://pay?',
    whatsapp: 'whatsapp://pay?'
  };

  if (appName === 'other') {
    return `upi://pay?${queryString}`;
  }

  if (isAndroid && packages[appName]) {
    const pkg = packages[appName];
    const fallback = encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`);
    return `intent://pay?${queryString}#Intent;scheme=upi;package=${pkg};S.browser_fallback_url=${fallback};end`;
  }

  if (isIOS && iosSchemes[appName]) {
    return `${iosSchemes[appName]}${queryString}`;
  }

  if (packages[appName]) {
    const pkg = packages[appName];
    return `intent://pay?${queryString}#Intent;scheme=upi;package=${pkg};end`;
  }

  return `upi://pay?${queryString}`;
}

const sampleUpiUri = 'upi://pay?pa=shg@oksbi&pn=Pragati%20SHG&am=1000&cu=INR&tn=Loan%20Repay%20Inst%20%231';

console.log('Testing UPI App Chooser URL Generation...');

// 1. Android Targeted Intent Tests (ensures WhatsApp does NOT intercept GPay, PhonePe, Paytm, etc.)
const androidGPay = generateTargetedUpiUrl('gpay', sampleUpiUri, 'android');
assert(androidGPay.startsWith('intent://pay?pa=shg@oksbi'), 'GPay should use intent:// on Android');
assert(androidGPay.includes('package=com.google.android.apps.nbu.paisa.user'), 'GPay must specify Google Pay package');
assert(!androidGPay.includes('package=com.whatsapp'), 'GPay must never specify WhatsApp package');

const androidPhonePe = generateTargetedUpiUrl('phonepe', sampleUpiUri, 'android');
assert(androidPhonePe.includes('package=com.phonepe.app'), 'PhonePe must specify PhonePe package');

const androidPaytm = generateTargetedUpiUrl('paytm', sampleUpiUri, 'android');
assert(androidPaytm.includes('package=net.one97.paytm'), 'Paytm must specify Paytm package');

const androidBhim = generateTargetedUpiUrl('bhim', sampleUpiUri, 'android');
assert(androidBhim.includes('package=in.org.npci.upiapp'), 'BHIM must specify NPCI BHIM package');

const androidWhatsApp = generateTargetedUpiUrl('whatsapp', sampleUpiUri, 'android');
assert(androidWhatsApp.includes('package=com.whatsapp'), 'WhatsApp choice explicitly opens WhatsApp');

const androidOther = generateTargetedUpiUrl('other', sampleUpiUri, 'android');
assert.strictEqual(androidOther, sampleUpiUri, 'Other UPI choice opens generic upi:// URI');

// 2. iOS Scheme Tests
const iosGPay = generateTargetedUpiUrl('gpay', sampleUpiUri, 'ios');
assert(iosGPay.startsWith('gpay://upi/pay?pa=shg@oksbi'), 'iOS GPay must use gpay:// scheme');

const iosPhonePe = generateTargetedUpiUrl('phonepe', sampleUpiUri, 'ios');
assert(iosPhonePe.startsWith('phonepe://pay?pa=shg@oksbi'), 'iOS PhonePe must use phonepe:// scheme');

const iosPaytm = generateTargetedUpiUrl('paytm', sampleUpiUri, 'ios');
assert(iosPaytm.startsWith('paytmmp://pay?pa=shg@oksbi'), 'iOS Paytm must use paytmmp:// scheme');

const iosWhatsApp = generateTargetedUpiUrl('whatsapp', sampleUpiUri, 'ios');
assert(iosWhatsApp.startsWith('whatsapp://pay?pa=shg@oksbi'), 'iOS WhatsApp must use whatsapp:// scheme');

console.log('✅ All UPI App Chooser URL generator tests passed successfully!');
