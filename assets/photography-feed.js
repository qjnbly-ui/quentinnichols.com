(() => {
  const grid = document.querySelector(".qjn-blend-grid");
  if (!grid) return;

  const images = [
    ["A 7305117", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/899a4ba9-630a-4f25-a776-71d6970bfe19/v1-a7305117.jpg"],
    ["A 7305144", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/d31e28c2-42e9-46b5-9b94-53977218608b/v1-a7305144-1.jpg"],
    ["A 7305540", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/9067ffd7-896e-40eb-a39e-0519806424e8/v1-a7305540-1.jpg"],
    ["A 7309756", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/32ac3e6b-bf14-4094-8a9d-bfc4882c0135/v1-a7309756-1.jpg"],
    ["A 7309809", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/e001a593-0482-4601-b71b-ad518f87e3eb/v1-a7309809.jpg"],
    ["Bootleg Fire Official", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/f7f67b9f-4271-451f-a707-8e534de54fb6/v1-bootlegfireofficial.jpg"],
    ["Cemetery", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/872f701c-74ab-4b21-ad5b-17a1b9109281/v1-cemetary-1.jpg"],
    ["Forest, North Carolina 10", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/a8e56447-d8bc-4c16-b1e1-e89a7fbd2d23/v1-forestnc-10.jpg"],
    ["Forest, North Carolina 11", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/582141d5-996f-42cc-8b12-c486d37745c3/v1-forestnc-11.jpg"],
    ["Forest, North Carolina 2", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/64ae9ba3-aafc-4a7a-b4ef-54259ebd3f6b/v1-forestnc-2.jpg"],
    ["Forest, North Carolina 3", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/49fb5784-9835-4c62-a33b-40807e462e0e/v1-forestnc-3.jpg"],
    ["Forest, North Carolina 4", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/8b103c02-62e4-4f81-80ac-a469726959bf/v1-forestnc-4.jpg"],
    ["Forest, North Carolina 5", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/7dcb02ae-1ee0-40ee-a7da-cb07e4f72014/v1-forestnc-5.jpg"],
    ["Forest, North Carolina 6", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/99764ae0-5548-4c5e-b887-26ddc1c59a4c/v1-forestnc-6.jpg"],
    ["Forest, North Carolina 7", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/1da5363d-6797-445e-9851-b23f82d1f307/v1-forestnc-7.jpg"],
    ["Forest, North Carolina 8", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/77951414-1fcc-4bab-a360-7b8f934479fc/v1-forestnc-8.jpg"],
    ["Forest, North Carolina 9", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/a9666f29-8831-4af7-8027-d05167700c69/v1-forestnc-9.jpg"],
    ["Girls at the Gateway Arch 1", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/17dbd8d5-b3e1-424d-8fba-8d06d352f9c5/v1-girlsgatewayarch-1.jpg"],
    ["Girls at the Gateway Arch 10", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/95557ee3-705f-43bf-ae12-a2603cc3371e/v1-girlsgatewayarch-10.jpg"],
    ["Girls at the Gateway Arch 8", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/a52eeac4-ff43-412e-b5c1-b58dc43a18ca/v1-girlsgatewayarch-8.jpg"],
    ["Hawaii Beach", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/4812b26d-03d1-47a6-9979-a0e02196da8d/v1-hawaiibeach.jpg"],
    ["Merrill, Oregon Water Tower", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/983c6f50-e8ce-41bb-ae9b-ad1384b784e8/v1-merrilloregonwatertower.jpg"],
    ["NEW 2 1", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/ca9abbf9-d666-4800-a224-1da9ca0036f9/v1-new2-1.jpg"],
    ["New Zealand Mountain", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/a2f44abd-908e-4e77-92d5-b52e8914f368/v1-newzealandmountain.jpg"],
    ["Oregon Coast", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/e817e153-8087-4a57-892c-d40a90218cff/v1-oregoncoast.jpg"],
    ["Gearhart Panorama 2", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/3bdd64e0-9c51-4be0-9be8-ed9ba55eef1d/v1-panogearhart10-12-25-2.jpg"],
    ["Gearhart Panorama 3", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/55463436-f84b-4863-9167-f8b42f8a8a70/v1-panogearhart10-12-25-3.jpg"],
    ["PSX 20221101 152051", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/3810f941-6e7e-413b-8b93-83d19f808528/v1-psx-20221101-152051.jpg"],
    ["Turner Falls, Oklahoma", "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/0b8f85a6-7375-45be-a3ff-210b31e09166/v1-turnerfallsok-1.jpg"],
  ].map(([name, url]) => ({ name, url }));

  const dialog = document.createElement("dialog");
  dialog.className = "qjn-photo-lightbox";
  dialog.setAttribute("aria-label", "Expanded photograph");
  dialog.innerHTML = `
    <button class="qjn-photo-lightbox-close" type="button" aria-label="Close expanded photograph">×</button>
    <button class="qjn-photo-lightbox-nav qjn-photo-lightbox-prev" type="button" aria-label="View previous photograph">‹</button>
    <div class="qjn-photo-lightbox-frame">
      <img alt="">
      <div class="qjn-photo-lightbox-meta">
        <p></p>
        <span></span>
      </div>
    </div>
    <button class="qjn-photo-lightbox-nav qjn-photo-lightbox-next" type="button" aria-label="View next photograph">›</button>
  `;
  document.body.appendChild(dialog);

  const dialogImage = dialog.querySelector("img");
  const dialogCaption = dialog.querySelector("p");
  const dialogCounter = dialog.querySelector(".qjn-photo-lightbox-meta span");
  const closeButton = dialog.querySelector(".qjn-photo-lightbox-close");
  const previousButton = dialog.querySelector(".qjn-photo-lightbox-prev");
  const nextButton = dialog.querySelector(".qjn-photo-lightbox-next");
  let activeIndex = 0;

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  function showImage(index) {
    activeIndex = (index + images.length) % images.length;
    const image = images[activeIndex];
    dialogImage.src = image.url;
    dialogImage.alt = image.name;
    dialogCaption.textContent = image.name;
    dialogCounter.textContent = `${activeIndex + 1} / ${images.length}`;
  }

  function openDialog(index) {
    showImage(index);
    dialog.showModal();
  }

  closeButton.addEventListener("click", closeDialog);
  previousButton.addEventListener("click", () => showImage(activeIndex - 1));
  nextButton.addEventListener("click", () => showImage(activeIndex + 1));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showImage(activeIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showImage(activeIndex + 1);
    }
  });

  const fragment = document.createDocumentFragment();
  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    figure.className = "qjn-blend-photo";

    const button = document.createElement("button");
    button.className = "qjn-gallery-open";
    button.type = "button";
    button.setAttribute("aria-label", `Expand ${image.name}`);

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.name;
    img.loading = "lazy";
    img.decoding = "async";

    const caption = document.createElement("span");
    caption.className = "qjn-gallery-caption";
    caption.textContent = image.name;

    button.append(img, caption);
    button.addEventListener("click", () => openDialog(index));
    figure.appendChild(button);
    fragment.appendChild(figure);
  });

  grid.replaceChildren(fragment);
})();
