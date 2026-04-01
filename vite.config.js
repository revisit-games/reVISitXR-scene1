import os from 'node:os';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

function getLocalIPv4s() {

  const interfaces = os.networkInterfaces();
  const addresses = new Set( [ 'localhost', '127.0.0.1' ] );

  for ( const entries of Object.values( interfaces ) ) {

    for ( const entry of entries || [] ) {

      if ( entry.family === 'IPv4' && ! entry.internal ) {

        addresses.add( entry.address );

      }

    }

  }

  return [ ...addresses ];

}

const domains = getLocalIPv4s();

export default defineConfig( {
  plugins: [
    basicSsl( {
      name: 'revisitxr-dev',
      domains,
    } ),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    https: true,
  },
} );
