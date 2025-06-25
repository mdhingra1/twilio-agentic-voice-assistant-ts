import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  ProfileTraitsResponse,
  ProfileEventsResponse,
  SegmentConfig,
} from "../types/segment.js";

export class SegmentProfileClient {
  private client: AxiosInstance;
  private spaceId: string;

  constructor(config: SegmentConfig) {
    this.spaceId = config.spaceId;
    this.client = axios.create({
      baseURL: config.profileApiBaseUrl,
      headers: {
        Authorization: `Basic ${btoa(config.profileApiToken + ":")}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Get user traits by external ID (e.g., email:user@example.com)
   */
  async getProfileTraits(
    externalId: string,
    spaceId?: string
  ): Promise<ProfileTraitsResponse> {
    try {
      const space = spaceId || this.spaceId;
      const response: AxiosResponse<ProfileTraitsResponse> =
        await this.client.get(
          `/v1/spaces/${space}/collections/users/profiles/${externalId}/traits`
        );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Profile not found for external ID: ${externalId}`);
      }
      throw new Error(`Failed to get profile traits: ${error.message}`);
    }
  }

  /**
   * Get user events by external ID (e.g., email:user@example.com)
   */
  async getProfileEvents(
    externalId: string,
    options: {
      limit?: number;
      cursor?: string;
      spaceId?: string;
      include?: string;
      exclude?: string;
    } = {}
  ): Promise<ProfileEventsResponse> {
    try {
      const space = options.spaceId || this.spaceId;
      const queryParams = new URLSearchParams();

      if (options.limit) {
        queryParams.append("limit", options.limit.toString());
      }
      if (options.cursor) {
        queryParams.append("cursor", options.cursor);
      }
      if (options.include) {
        queryParams.append("include", options.include);
      }
      if (options.exclude) {
        queryParams.append("exclude", options.exclude);
      }

      const url = `/v1/spaces/${space}/collections/users/profiles/${externalId}/events`;
      const fullUrl = queryParams.toString()
        ? `${url}?${queryParams.toString()}`
        : url;

      const response: AxiosResponse<ProfileEventsResponse> =
        await this.client.get(fullUrl);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Profile not found for external ID: ${externalId}`);
      }
      throw new Error(`Failed to get profile events: ${error.message}`);
    }
  }
}
