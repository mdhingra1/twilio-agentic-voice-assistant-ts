import axios from 'axios';
import {
    SEGMENT_PROFILE_API_TOKEN,
    SEGMENT_SPACE_ID,
} from "../shared/env.js";


const BASE_URL = `https://profiles.segment.com/v1/spaces/${SEGMENT_SPACE_ID}`;

async function getProfileTraits(externalId) {
    const url = `${BASE_URL}/collections/users/profiles/${externalId}/traits?limit=20`;
    const res = await axios.get(url, {
        headers: {
            Authorization: `Basic ${btoa(SEGMENT_PROFILE_API_TOKEN + ':')}`,
            "Content-Type": "application/json",
        }
    });
    let traits = res.data;
    if (!traits) return 'No traits found.';
    return Object.entries(traits.traits)
}

async function getProfileEvents(externalId, limit = 20) {
    const url = `${BASE_URL}/collections/users/profiles/${externalId}/events?limit=20`;
    const res = await axios.get(url, {
        headers: {
            Authorization: `Basic ${btoa(SEGMENT_PROFILE_API_TOKEN+ ':')}`,
            "Content-Type": "application/json",
        }

    });
    if (!res.data) {
        return [];
    }
    let events = res.data.data;
    if (!Array.isArray(events) || events.length === 0) return [];
    return events.map(e => {
        const props = e.properties ? JSON.stringify(e.properties) : '{}';
        return {event: e.event, timestamp: e.timestamp, properties: props};
    })

}

export async function getProfile(externalId) {
    if (!externalId) {
        throw new Error("External ID is required");
    }

    const traits = await getProfileTraits(externalId);
    const events = await getProfileEvents(externalId);

    return {
        user_id: externalId,
        traits: traits,
        events: events,
    };
}