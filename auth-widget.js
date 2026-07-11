import { getMe, logout } from "./api-client.js";

async function render() {
  const bar = document.getElementById("auth-bar");
  if (!bar) return;

  let me = null;
  try {
    me = await getMe();
  } catch {
    bar.textContent = "";
    return; // backend unreachable - fail quiet, don't block the page
  }

  if (!me) {
    bar.innerHTML = `<a href="/login.html">Log in</a> &middot; <a href="/register.html">Register</a>`;
    return;
  }

  const adminLink = me.role === "admin" ? ` &middot; <a href="/admin.html">Admin</a>` : "";
  bar.innerHTML = `Signed in as <a href="/profile.html">${me.username}</a>${adminLink} &middot; <button class="link-btn" id="logout-btn">Log out</button>`;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    location.reload();
  });
}

render();
