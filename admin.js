import {
  getMe,
  adminListUsers,
  adminApproveUser,
  adminRejectUser,
  adminCreateUser,
} from "./api-client.js";

function renderPendingTable(users) {
  const wrap = document.getElementById("pending-table-wrap");
  if (users.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No pending signups.</div>';
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = `
    <tr><th>Username</th><th>Email</th><th>Requested</th><th></th></tr>
  `;
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.email || "-"}</td>
      <td>${new Date(u.createdAt + "Z").toLocaleString()}</td>
      <td class="row-actions">
        <button data-action="approve" data-id="${u.id}">Approve</button>
        <button data-action="reject" data-id="${u.id}" class="secondary">Reject</button>
      </td>
    `;
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    btn.disabled = true;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.action === "approve") await adminApproveUser(id);
      else await adminRejectUser(id);
      await loadAll();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });
}

function renderApprovedTable(users) {
  const wrap = document.getElementById("approved-table-wrap");
  if (users.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No approved users yet.</div>';
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<tr><th>Username</th><th>Email</th><th>Role</th><th>Joined</th></tr>";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.email || "-"}</td>
      <td>${u.role}</td>
      <td>${new Date(u.createdAt + "Z").toLocaleDateString()}</td>
    `;
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

async function loadAll() {
  const [pending, approved] = await Promise.all([
    adminListUsers("pending"),
    adminListUsers("approved"),
  ]);
  renderPendingTable(pending);
  renderApprovedTable(approved);
}

async function init() {
  const me = await getMe();
  if (!me || me.role !== "admin") {
    document.getElementById("access-denied").classList.remove("hidden");
    return;
  }
  document.getElementById("admin-content").classList.remove("hidden");
  await loadAll();

  document.getElementById("create-user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const messageEl = document.getElementById("create-user-message");
    messageEl.textContent = "";
    messageEl.className = "form-message";
    try {
      await adminCreateUser({
        username: form.username.value,
        email: form.email.value,
        password: form.password.value,
      });
      messageEl.textContent = "Account created.";
      messageEl.classList.add("success");
      form.reset();
      await loadAll();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.classList.add("error");
    }
  });
}

init();
