import { register } from "./api-client.js";

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const messageEl = document.getElementById("message");
  messageEl.textContent = "";
  messageEl.className = "form-message";

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await register({
      username: form.username.value,
      email: form.email.value,
      password: form.password.value,
    });
    messageEl.textContent = "Account created! An admin needs to approve it before you can log in.";
    messageEl.classList.add("success");
    form.reset();
  } catch (err) {
    messageEl.textContent = err.message;
    messageEl.classList.add("error");
    submitBtn.disabled = false;
  }
});
