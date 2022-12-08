export interface DiscordEmbedImage {
  url: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}
export interface DiscordEmbedVideo {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedThumbnail {
  url: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbed {
  type: 'gifv' | 'image' | 'link' | 'rich' | 'video' | 'article' | 'auto_moderation_message';
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  video?: DiscordEmbedVideo;
}

export interface DiscordAttachment {
  id: string;
  url: string;
  proxy_url?: string;
  size?: number;
  filename?: string;
  content_type?: string;
  height?: number;
  width?: number;
  description?: string;
}
