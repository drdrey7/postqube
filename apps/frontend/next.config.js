// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

// Source maps/instrumentation are built only when Sentry is configured.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyTimeout: 90_000,
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
    cpus: 1,
  },
  // Document-Policy header for browser profiling
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  transpilePackages: ['crypto-hash'],
  // Enable production sourcemaps for Sentry
  productionBrowserSourceMaps: sentryEnabled,

  // Custom webpack config to ensure sourcemaps are generated properly
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Enable sourcemaps for both client and server in production
    if (!dev && sentryEnabled) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
    }

    if (!dev && !sentryEnabled) config.devtool = false;
    return config;
  },
  async redirects() {
    return [
      { source: '/launches', has: [{ type: 'query', key: 'view', value: 'ideas' }], destination: '/ideas', permanent: false },
      {
        source: '/api/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local' ? '/uploads/:path*' : '/404',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local'
            ? '/api/uploads/:path*'
            : '/404',
      },
    ];
  },
};

export default sentryEnabled ? withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sourcemap configuration optimized for monorepo
  sourcemaps: {
    disable: false,
    // More comprehensive asset patterns for monorepo
    assets: [
      '.next/static/**/*.js',
      '.next/static/**/*.js.map',
      '.next/server/**/*.js',
      '.next/server/**/*.js.map',
    ],
    ignore: [
      '**/node_modules/**',
      '**/*hot-update*',
      '**/_buildManifest.js',
      '**/_ssgManifest.js',
      '**/*.test.js',
      '**/*.spec.js',
    ],
    deleteSourcemapsAfterUpload: true,
  },

  // Release configuration
  release: {
    create: true,
    finalize: true,
    // Use git commit hash for releases in monorepo
    name:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined,
  },

  // NextJS specific optimizations for monorepo
  widenClientFileUpload: true,

  // Additional configuration
  telemetry: false,
  silent: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',

  // Error handling for CI/CD
  errorHandler: (error) => {
    console.warn('Sentry build error occurred:', error.message);
    console.warn(
      'This might be due to missing Sentry environment variables or network issues'
    );
    // Don't fail the build if Sentry upload fails in monorepo context
    return;
  },
}) : nextConfig;
