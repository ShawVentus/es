export type FrameMessageLogger = (message: string, error?: unknown) => void;

const BLANK_FRAME_URLS = new Set(['about:blank', 'about:srcdoc']);

export function resolveFrameTargetOrigin(frameUrl: string, fallbackOrigin = window.location.origin): string {
  try {
    return new URL(frameUrl || '/', fallbackOrigin).origin;
  } catch {
    return fallbackOrigin;
  }
}

function readFrameHref(iframe: HTMLIFrameElement): string | undefined {
  try {
    return iframe.contentWindow?.location.href;
  } catch {
    // 跨域 iframe 无法读取 location；这不代表未加载，仍允许按严格 targetOrigin 发送。
    return undefined;
  }
}

function isBlankFrameUrl(href: string | undefined): boolean {
  return typeof href === 'string' && BLANK_FRAME_URLS.has(href);
}

export function safePostMessageToFrame(
  iframe: HTMLIFrameElement | null | undefined,
  message: unknown,
  targetOrigin: string,
  log?: FrameMessageLogger,
): boolean {
  const targetWindow = iframe?.contentWindow;

  if (!targetWindow) {
    log?.('Skipped postMessage: iframe contentWindow is not ready');
    return false;
  }

  const frameHref = iframe ? readFrameHref(iframe) : undefined;
  if (isBlankFrameUrl(frameHref)) {
    log?.(`Skipped postMessage: iframe is still ${frameHref}`);
    return false;
  }

  try {
    targetWindow.postMessage(message, targetOrigin);
    return true;
  } catch (error) {
    log?.('Skipped postMessage: target window rejected the configured origin', error);
    return false;
  }
}
