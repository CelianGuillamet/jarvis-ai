import { SetMetadata } from '@nestjs/common';
export const PUBLIC_ENDPOINT = 'jarvis.public-endpoint';
export const PublicEndpoint = () => SetMetadata(PUBLIC_ENDPOINT, true);
