import { Component } from 'react';
import { Button } from './common';

const RELOAD_FLAG = 'ggec-chunk-reload';
// A failed dynamic import (the page was loaded before a newer deploy replaced its chunk's
// hashed filename) looks like this across browsers -- recoverable by a single reload, since the
// new page load fetches the current index.html with current chunk references.
const isStaleChunkError = (error) =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    error?.message || '',
  );

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    if (isStaleChunkError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      // Reload at most once per session for this reason -- if it keeps failing after a fresh
      // load, it's a real error, not a stale chunk, and should surface the fallback UI instead
      // of silently reloading forever.
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading">
        GGEC
        <span>Something didn't load correctly.</span>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    );
  }
}
