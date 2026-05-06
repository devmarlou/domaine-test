import 'vite/modulepreload-polyfill'

/**
 * Product card — swatch hover/click handlers.
 *
 * Used by:
 *   - snippets/product-card.liquid
 *
 * Behavior:
 *   On pointerenter / focusin of [data-swatch]:
 *     - Pre-warm the browser cache for that variant's primary image so
 *       the click swap feels instant.
 *
 *   On click of [data-swatch] inside [data-product-card]:
 *     - Await image.decode() on the primary image, then swap src+srcset
 *       on both [data-role=primary] and [data-role=secondary] <img> tags
 *       (eliminates the brief blink while the new image loads).
 *     - Update [data-role=price] text + sale color
 *     - Update [data-role=compare-price] text + visibility
 *     - Toggle [data-role=sale-badge] / [data-role=sold-out-badge] visibility
 *       (mutually exclusive — sold-out wins over sale)
 *     - Update [data-role=custom-badge] label + colors from variant
 *       metafields (marketing.badge_*); hidden when label blank or sold out
 *     - Set aria-pressed=true on the clicked swatch (false on siblings)
 *
 * Implementation notes:
 *   - Document-level delegation so dynamically loaded sections (theme editor)
 *     work without re-init.
 *   - Reads variant data from swatch data-* attributes; no Shopify API call.
 *   - Tracks already-prefetched URLs in a Set to avoid duplicate requests.
 */

const prefetched = new Set()

function prefetchImage(src, srcset) {
  if (!src || prefetched.has(src)) return
  prefetched.add(src)
  const img = new Image()
  if (srcset) img.srcset = srcset
  img.src = src
}

function preloadSwatchImages(swatch) {
  prefetchImage(swatch.dataset.primary, swatch.dataset.primarySrcset)
  prefetchImage(swatch.dataset.secondary, swatch.dataset.secondarySrcset)
}

document.addEventListener(
  'pointerenter',
  (event) => {
    const swatch = event.target.closest?.('[data-swatch]')
    if (swatch) preloadSwatchImages(swatch)
  },
  true,
)

document.addEventListener('focusin', (event) => {
  const swatch = event.target.closest?.('[data-swatch]')
  if (swatch) preloadSwatchImages(swatch)
})

async function swapImage(img, src, srcset) {
  if (!img || !src) return
  const preloader = new Image()
  if (srcset) preloader.srcset = srcset
  preloader.src = src
  if (typeof preloader.decode === 'function') {
    try {
      await preloader.decode()
    } catch {
      /* tolerate decode failures (e.g. broken image URL) and fall through */
    }
  }
  img.src = src
  if (srcset) img.srcset = srcset
}

/**
 * Featured-products slider — prev/next + counter.
 *
 * Used by:
 *   - sections/featured-products.liquid
 *
 * Behavior:
 *   - Click [data-slider-prev]/[data-slider-next]: scrollBy ±track.clientWidth
 *     with smooth behavior (one "page" per click).
 *   - IntersectionObserver on each card (root = track, threshold 0.5):
 *     tracks which card indexes are visible; counter shows max+1.
 *   - On scroll: toggle prev.disabled at left edge, next.disabled at right.
 *   - Re-init on shopify:section:load for theme editor live preview.
 *
 * Implementation notes:
 *   - Track is the scroll-snap container; cards are direct children, so
 *     `track.children` indexes line up with product order.
 *   - `getRootNode()` is used so the handler works in editor iframes.
 */

function initFeaturedSlider(root) {
  const track = root.querySelector('[data-slider-track]')
  if (!track) return

  const counter = root.querySelector('[data-slider-current]')
  const prevBtn = root.querySelector('[data-slider-prev]')
  const nextBtn = root.querySelector('[data-slider-next]')
  const cards = Array.from(track.children)
  if (cards.length === 0) return

  const visible = new Set()

  const updateCounter = () => {
    if (!counter || visible.size === 0) return
    counter.textContent = String(Math.max(...visible) + 1)
  }

  const updateButtons = () => {
    if (!prevBtn || !nextBtn) return
    prevBtn.disabled = track.scrollLeft <= 1
    nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1
  }

  if (counter) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = cards.indexOf(entry.target)
          if (idx === -1) continue
          if (entry.intersectionRatio >= 0.5) visible.add(idx)
          else visible.delete(idx)
        }
        updateCounter()
      },
      { root: track, threshold: 0.5 },
    )
    cards.forEach((card) => io.observe(card))
  }

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' })
    })
    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: track.clientWidth, behavior: 'smooth' })
    })
    track.addEventListener('scroll', () => requestAnimationFrame(updateButtons), {
      passive: true,
    })
    updateButtons()
  }
}

document.querySelectorAll('[data-featured-products]').forEach(initFeaturedSlider)

document.addEventListener('shopify:section:load', (event) => {
  const root = event.target.querySelector?.('[data-featured-products]')
  if (root) initFeaturedSlider(root)
})

document.addEventListener('click', async (event) => {
  const swatch = event.target.closest('[data-swatch]')
  if (!swatch) return

  const card = swatch.closest('[data-product-card]')
  if (!card) return

  const onSale = swatch.dataset.onSale === 'true'
  const soldOut = swatch.dataset.available === 'false'

  card.querySelectorAll('[data-swatch]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn === swatch ? 'true' : 'false')
  })

  const priceEl = card.querySelector('[data-role="price"]')
  if (priceEl && swatch.dataset.price) {
    priceEl.textContent = swatch.dataset.price
    priceEl.classList.toggle('text-[#FF0000]', onSale)
    priceEl.classList.toggle('text-[#111111]', !onSale)
  }

  const compareEl = card.querySelector('[data-role="compare-price"]')
  if (compareEl) {
    if (onSale && swatch.dataset.comparePrice) {
      compareEl.textContent = swatch.dataset.comparePrice
      compareEl.classList.remove('hidden')
    } else {
      compareEl.classList.add('hidden')
    }
  }

  const saleBadge = card.querySelector('[data-role="sale-badge"]')
  const soldOutBadge = card.querySelector('[data-role="sold-out-badge"]')
  if (soldOutBadge) soldOutBadge.classList.toggle('hidden', !soldOut)
  if (saleBadge) saleBadge.classList.toggle('hidden', soldOut || !onSale)

  const customBadge = card.querySelector('[data-role="custom-badge"]')
  if (customBadge) {
    const label = swatch.dataset.badgeLabel || ''
    const textColor = swatch.dataset.badgeTextColor || '#111111'
    const bgColor = swatch.dataset.badgeBackgroundColor || 'var(--badge-bg, #FFFFFF)'
    customBadge.textContent = label
    customBadge.style.color = textColor
    customBadge.style.borderColor = textColor
    customBadge.style.backgroundColor = bgColor
    customBadge.classList.toggle('hidden', soldOut || !label)
  }

  const primaryImg = card.querySelector('img[data-role="primary"]')
  const secondaryImg = card.querySelector('img[data-role="secondary"]')
  await Promise.all([
    swapImage(primaryImg, swatch.dataset.primary, swatch.dataset.primarySrcset),
    swapImage(secondaryImg, swatch.dataset.secondary, swatch.dataset.secondarySrcset),
  ])
})
