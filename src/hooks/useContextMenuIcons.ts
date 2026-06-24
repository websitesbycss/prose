import { useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentType } from 'react'
import { createElement } from 'react'

/**
 * FortuneSheet's and Excalidraw's native right-click menus render plain text
 * rows with no per-item class/data-attribute to hook into — the only stable
 * signal is the rendered label text. This watches for menu item elements to
 * appear and prepends a small icon (matched by exact label text) so the
 * native menus visually match the icon treatment in EditorContextMenu /
 * SlidesContextMenu. Unmapped labels are left exactly as-is — no behavior is
 * ever touched, this only adds a decorative <span> before existing content.
 */
export function useContextMenuIcons(
  itemSelector: string,
  iconMap: Record<string, ComponentType<{ className?: string }>>,
): void {
  useEffect(() => {
    function decorateOne(item: Element): void {
      if (item.querySelector(':scope > .prose-menu-item-icon')) return
      const label = item.textContent?.trim() ?? ''
      const Icon = iconMap[label]
      if (!Icon) return
      const span = document.createElement('span')
      span.className = 'prose-menu-item-icon fortune-menu-item-icon'
      span.innerHTML = renderToStaticMarkup(createElement(Icon))
      item.insertBefore(span, item.firstChild)
    }

    function decorate(root: Element): void {
      if (root.matches(itemSelector)) decorateOne(root)
      root.querySelectorAll(itemSelector).forEach(decorateOne)
    }

    decorate(document.body)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          decorate(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [itemSelector, iconMap])
}
