export default function Settings() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Authentication</h2>
        <p>Demo mode is active: the OTP is simulated. Set <code>DEMO_MODE=false</code> on the backend to generate random OTPs. Only dummy Aadhaar data is used.</p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Sensor integration</h2>
        <p>ESP32 devices post to <code>/api/sensors/readings</code> with the <code>x-device-key</code> header, whose value comes from <code>DEVICE_KEY</code>.</p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Scoring</h2>
        <p>Early warning scores follow the NEWS2 scale 1 thresholds. Results are decision support only and are not a diagnosis.</p>
      </section>
    </div>
  );
}