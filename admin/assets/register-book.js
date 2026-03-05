import { supabase } from "./supabase-client.js";

const MAX_IMAGE_BYTES = 50 * 1024;

const els = {
  form: document.querySelector("[data-register-form]"),
  title: document.querySelector("#title"),
  author: document.querySelector("#author"),
  publisher: document.querySelector("#publisher"),
  pageCount: document.querySelector("#pageCount"),
  publishedAt: document.querySelector("#publishedAt"),
  opinion: document.querySelector("#opinion"),
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
      "image/webp",
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

  const pageCount = Number(els.pageCount.value);
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    return "페이지 수는 1 이상의 숫자여야 합니다.";
  }

  if (!els.publishedAt.value) return "출간일을 선택하세요.";
  if (!encodedImage) return "표지 이미지를 선택하세요.";

  return "";
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
    const fileName = `${sanitizeBaseName(file.name)}.webp`;

    encodedImage = {
      base64,
      fileName,
      mimeType: "image/webp",
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
    const payload = {
      title: els.title.value.trim(),
      author: els.author.value.trim(),
      publisher: els.publisher.value.trim(),
      image_base64: encodedImage.base64,
      image_mime_type: encodedImage.mimeType,
      image_filename: encodedImage.fileName,
      page_count: Number(els.pageCount.value),
      published_at: els.publishedAt.value,
      opinion: els.opinion.value.trim(),
    };

    const { data, error } = await supabase.functions.invoke("register-book", {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || "요청 실패");
    }

    setStatus("등록 검토 요청 완료", "ok");
    if (els.response) {
      els.response.textContent = JSON.stringify(data, null, 2);
    }

    els.form.reset();
    encodedImage = null;
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

  const targets = els.form.querySelectorAll("input, textarea, button");
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

if (els.form) {
  els.form.addEventListener("submit", submitRegistration);
}

syncFormEnabled();

