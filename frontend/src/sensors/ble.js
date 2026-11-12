// Web Bluetooth bridge for standard BLE heart-rate wearables
// (Heart Rate Service 0x180D / Heart Rate Measurement 0x2A37).
// Works in Chrome/Edge (Android + desktop). Safari/iOS do not support Web Bluetooth.
// Callback receives { heartRate } every BLE notification; caller throttles/forwards.

export async function connectBLE(onReading) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not available in this browser (use Chrome or Edge on Android/PC).');
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }],
    optionalServices: ['battery_service'],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const hr = await service.getCharacteristic('heart_rate_measurement');
  await hr.startNotifications();
  hr.addEventListener('characteristicvaluechanged', (e) => {
    const v = e.target.value;
    const flags = v.getUint8(0);
    const bpm = flags & 0x01 ? v.getUint16(1, true) : v.getUint8(1);
    onReading({ heartRate: bpm });
  });
  return device;
}
