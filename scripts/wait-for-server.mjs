for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(process.env.TEST_BASE_URL || "http://127.0.0.1:3000");
    if (response.ok) process.exit(0);
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("Local web server did not become ready.");
