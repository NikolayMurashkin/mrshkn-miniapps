import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  sassOptions: {
    silenceDeprecations: ['legacy-js-api'],
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
