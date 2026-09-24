const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
async function test() {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + GEMINI_API_KEY);
  const data = await res.json();
  console.log("AVAILABLE MODELS FOR THIS KEY:");
  if (data.models) {
    data.models.forEach(m => console.log(m.name));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
test();
