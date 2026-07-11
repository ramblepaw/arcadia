import { login } from "./api-client.js";

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const messageEl = document.getElementById("message");
  messageEl.textContent = "";
  messageEl.className = "form-message";

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await login({ username: form.username.value, password: form.password.value });
    const params = new URLSearchParams(location.search);
    location.href = params.get("redirect") || "index.html";
  } catch (err) {
    messageEl.textContent = err.message;
    messageEl.classList.add("error");
    submitBtn.disabled = false;
  }
});
