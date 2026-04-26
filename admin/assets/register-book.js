import { supabase } from "./supabase-client.js";

const MAX_IMAGE_BYTES = 50 * 1024;

const els = {
  form: document.querySelector("[data-register-form]"),
  title: document.querySelector("#title"),
  author: document.querySelector("#author"),
  publisher: document.querySelector("#publisher"),
  isbn13: document.querySelector("#isbn13"),
  isbn10: document.querySelector("#isbn10"),
  categoryId: document.querySelector("#categoryId"),
  pageCount: document.querySelector("#pageCount"),
  publishedAt: document.querySelector("#publishedAt"),
  bookDescription: document.querySelector("#bookDescription"),
  opinion: document.querySelector("#opinion"),
  authorList: document.querySelector("[data-author-list]"),
  addAuthorButton: document.querySelector("[data-add-author-button]"),
  imageFile: document.querySelector("#imageFile"),
  imagePreviewBox: document.querySelector("[data-image-preview]"),
  imagePreview: document.querySelector("[data-image-preview-img]"),
  imageMeta: document.querySelector("[data-image-meta]"),
  submitButton: document.querySelector("[data-submit-button]"),
  status: document.querySelector("[data-submit-status]"),
  response: document.querySelector("[data-response-json]"),
};

let currentSession = null;
let encodedImage = null;

const AUTHOR_TYPES = [
  { value: "author", label: "지은이" },
  { value: "writer", label: "글" },
  { value: "illustrator", label: "그림" },
  { value: "translator", label: "옮긴이" },
  { value: "editor", label: "엮은이" },
  { value: "photographer", label: "사진" },
  { value: "designer", label: "디자인" },
  { value: "other", label: "기타" },
];

const DEFAULT_ROLE_BY_TYPE = Object.fromEntries(
  AUTHOR_TYPES.map((item) => [item.value, item.label]),
);

function setStatus(message, type = "") {
  if (!els.status) return;
  els.status.className = `status ${type}`.trim();
  els.status.textContent = message;
}

function sanitizeBaseName(name) {
  const raw = String(name || "book-cover").replace(/\.[^/.]+$/, "");
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe || "book-cover";
}

function normalizePublishedAtInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  let y = 0;
  let m = 0;
  let d = 0;

  if (/^\d{8}$/.test(text)) {
    y = Number(text.slice(0, 4));
    m = Number(text.slice(4, 6));
    d = Number(text.slice(6, 8));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split("-");
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() + 1 !== m ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지 변환 실패"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressImageUnder50Kb(file) {
  const originalBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/jpeg" });
  const image = await loadImageElement(originalBlob);

  let width = Math.min(image.naturalWidth || image.width, 1400);
  let quality = 0.9;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const ratio = width / (image.naturalWidth || image.width);
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 초기화 실패");
    ctx.drawImage(image, 0, 0, width, height);

    const compressed = await canvasToBlob(canvas, quality);

    if (compressed.size <= MAX_IMAGE_BYTES) {
      return compressed;
    }

    quality = Math.max(0.2, quality - 0.1);
    width = Math.max(320, Math.round(width * 0.85));
  }

  throw new Error("이미지를 50KB 이하로 압축하지 못했습니다. 더 작은 이미지를 선택하세요.");
}

function validateForm() {
  if (!els.title.value.trim()) return "제목을 입력하세요.";
  if (!els.author.value.trim()) return "저자를 입력하세요.";
  if (!els.publisher.value.trim()) return "출판사를 입력하세요.";

  const pageText = String(els.pageCount.value || "").trim();
  if (pageText) {
    const pageCount = Number(pageText);
    if (!Number.isFinite(pageCount) || pageCount <= 0) {
      return "페이지 수는 1 이상의 숫자여야 합니다.";
    }
  }

  const categoryIdText = String(els.categoryId.value || "").trim();
  if (categoryIdText) {
    const categoryId = Number(categoryIdText);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return "카테고리 ID는 1 이상의 정수여야 합니다.";
    }
  }

  if (collectAuthorList().length === 0) {
    return "저자 목록(author_list)을 1명 이상 입력하세요.";
  }

  const publishedAt = normalizePublishedAtInput(els.publishedAt.value);
  if (!publishedAt) return "출간일은 YYYYMMDD 형식으로 입력하세요.";
  if (!encodedImage) return "표지 이미지를 선택하세요.";

  return "";
}

function createAuthorRow(author = { name: "", role: "지은이", type: "author" }) {
  const row = document.createElement("div");
  row.className = "author-row";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "이름";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.dataset.authorName = "true";
  nameInput.value = author.name || "";
  nameInput.placeholder = "예: 한강";
  nameLabel.append(nameInput);

  const roleLabel = document.createElement("label");
  roleLabel.textContent = "역할명";
  const roleInput = document.createElement("input");
  roleInput.type = "text";
  roleInput.dataset.authorRole = "true";
  roleInput.value = author.role || DEFAULT_ROLE_BY_TYPE[author.type] || "기타";
  roleInput.placeholder = "예: 저자, 옮긴이";
  roleLabel.append(roleInput);

  const typeLabel = document.createElement("label");
  typeLabel.textContent = "타입";
  const typeSelect = document.createElement("select");
  typeSelect.dataset.authorType = "true";
  AUTHOR_TYPES.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    typeSelect.append(option);
  });
  typeSelect.value = AUTHOR_TYPES.some((item) => item.value === author.type)
    ? author.type
    : "other";
  typeSelect.addEventListener("change", () => {
    const previousDefaultRoles = new Set(Object.values(DEFAULT_ROLE_BY_TYPE));
    if (!roleInput.value.trim() || previousDefaultRoles.has(roleInput.value.trim())) {
      roleInput.value = DEFAULT_ROLE_BY_TYPE[typeSelect.value] || "기타";
    }
  });
  typeLabel.append(typeSelect);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn-danger";
  removeButton.textContent = "삭제";
  removeButton.dataset.removeAuthor = "true";

  row.append(nameLabel, roleLabel, typeLabel, removeButton);
  return row;
}

function addAuthorRow(author) {
  if (!els.authorList) return;
  els.authorList.append(createAuthorRow(author));
}

function collectAuthorList() {
  if (!els.authorList) return [];

  return [...els.authorList.querySelectorAll(".author-row")]
    .map((row) => {
      const name = row.querySelector("[data-author-name]")?.value.trim() || "";
      const role = row.querySelector("[data-author-role]")?.value.trim() || "";
      const type = row.querySelector("[data-author-type]")?.value || "other";
      return { name, role: role || DEFAULT_ROLE_BY_TYPE[type] || "기타", type };
    })
    .filter((author) => author.name);
}

function ensureAuthorListSeeded() {
  if (!els.authorList || els.authorList.children.length > 0) return;
  addAuthorRow({ name: els.author.value.trim(), role: "지은이", type: "author" });
}

async function handleImageSelection() {
  const file = els.imageFile.files?.[0];
  encodedImage = null;

  if (!file) {
    if (els.imagePreviewBox) els.imagePreviewBox.classList.add("hidden");
    return;
  }

  setStatus("이미지 압축 중...");

  try {
    const compressedBlob = await compressImageUnder50Kb(file);
    const base64 = await blobToBase64(compressedBlob);
    const fileName = `${sanitizeBaseName(file.name)}.jpg`;

    encodedImage = {
      base64,
      fileName,
      mimeType: "image/jpeg",
      size: compressedBlob.size,
    };

    if (els.imagePreview) {
      const previewUrl = URL.createObjectURL(compressedBlob);
      els.imagePreview.src = previewUrl;
      els.imagePreview.onload = () => URL.revokeObjectURL(previewUrl);
    }

    if (els.imageMeta) {
      els.imageMeta.textContent = `${fileName} (${compressedBlob.size} bytes)`;
    }

    if (els.imagePreviewBox) {
      els.imagePreviewBox.classList.remove("hidden");
    }

    setStatus("이미지 준비 완료", "ok");
  } catch (error) {
    setStatus(error.message || "이미지 처리 실패", "error");
  }
}

async function submitRegistration(event) {
  event.preventDefault();

  if (!currentSession?.user) {
    setStatus("로그인이 필요합니다.", "error");
    return;
  }

  const validationError = validateForm();
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  if (els.submitButton) {
    els.submitButton.disabled = true;
    els.submitButton.textContent = "전송 중...";
  }

  try {
    const pageText = String(els.pageCount.value || "").trim();
    const categoryIdText = String(els.categoryId.value || "").trim();
    const normalizedPublishedAt = normalizePublishedAtInput(els.publishedAt.value);

    if (!normalizedPublishedAt) {
      throw new Error("출간일은 YYYYMMDD 형식으로 입력하세요.");
    }

    const payload = {
      title: els.title.value.trim(),
      author: els.author.value.trim(),
      publisher: els.publisher.value.trim(),
      isbn13: els.isbn13.value.trim(),
      isbn10: els.isbn10.value.trim(),
      category_id: categoryIdText ? Number(categoryIdText) : null,
      author_list: collectAuthorList(),
      image_base64: encodedImage.base64,
      image_mime_type: encodedImage.mimeType,
      image_filename: encodedImage.fileName,
      page_count: pageText ? Number(pageText) : null,
      published_at: normalizedPublishedAt,
      description: els.bookDescription.value.trim(),
      opinion: els.opinion.value.trim(),
    };

    const { data, error } = await supabase.functions.invoke("register-book", {
      body: payload,
    });

    if (error) {
      let detail = "";
      if (error.context instanceof Response) {
        try {
          const body = await error.context.json();
          detail = String(body?.error || body?.message || "").trim();
        } catch (_) {
          detail = "";
        }
      }
      throw new Error(detail || error.message || "요청 실패");
    }

    setStatus("등록 검토 요청 완료", "ok");
    if (els.response) {
      els.response.textContent = JSON.stringify(data, null, 2);
    }

    els.form.reset();
    encodedImage = null;
    if (els.authorList) {
      els.authorList.innerHTML = "";
      addAuthorRow();
    }
    if (els.imagePreviewBox) els.imagePreviewBox.classList.add("hidden");
  } catch (error) {
    setStatus(error.message || "전송 실패", "error");
    if (els.response) {
      els.response.textContent = String(error.message || error);
    }
  } finally {
    if (els.submitButton) {
      els.submitButton.disabled = false;
      els.submitButton.textContent = "등록 검토 요청";
    }
  }
}

function syncFormEnabled() {
  const enabled = Boolean(currentSession?.user);
  if (!els.form) return;

  const targets = els.form.querySelectorAll("input, textarea, select, button");
  targets.forEach((el) => {
    if (el === els.submitButton) return;
    el.disabled = !enabled;
  });

  if (els.submitButton) {
    els.submitButton.disabled = !enabled;
  }
}

document.addEventListener("admin-auth-changed", (event) => {
  currentSession = event.detail?.session || null;
  syncFormEnabled();
});

if (els.imageFile) {
  els.imageFile.addEventListener("change", handleImageSelection);
}

if (els.addAuthorButton) {
  els.addAuthorButton.addEventListener("click", () => addAuthorRow());
}

if (els.authorList) {
  els.authorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-author]");
    if (!button) return;
    button.closest(".author-row")?.remove();
    ensureAuthorListSeeded();
  });
}

if (els.author) {
  els.author.addEventListener("blur", () => {
    const rows = els.authorList?.querySelectorAll(".author-row") || [];
    if (rows.length !== 1) return;

    const nameInput = rows[0].querySelector("[data-author-name]");
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = els.author.value.trim();
    }
  });
}

if (els.form) {
  els.form.addEventListener("submit", submitRegistration);
}

addAuthorRow();
syncFormEnabled();

