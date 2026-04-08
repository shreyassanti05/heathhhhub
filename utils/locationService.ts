export interface Hospital {
    name: string;
    address: string;
    distanceInfo?: string;
    lat?: number;
    lon?: number;
}

// Haversine formula to calculate the distance between two lat/lng coordinates in miles
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
    const R = 3958.8; // Radius of the earth in miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
};

export const fetchNearbyHospitals = async (latitude: number, longitude: number, searchType: 'oncology' | 'radiology' | 'general' = 'general'): Promise<Hospital[]> => {
    // We are expanding radius for specific hospital searches where general ones are 10km and specific are 20km
    const radius = searchType === 'general' ? 10000 : 20000;

    // An Overpass QL query to find hospitals or clinics nearby
    // we query node and way. Rel doesn't matter too much but let's include it.
    const rawQuery = `
        [out:json][timeout:25];
        (
            node["amenity"~"hospital|clinic"](around:${radius},${latitude},${longitude});
            way["amenity"~"hospital|clinic"](around:${radius},${latitude},${longitude});
            relation["amenity"~"hospital|clinic"](around:${radius},${latitude},${longitude});
        );
        out center;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `data=${encodeURIComponent(rawQuery)}`
        });

        if (!response.ok) {
            throw new Error('Pinging mapping service failed');
        }

        const data = await response.json();

        if (!data.elements || data.elements.length === 0) {
            return [];
        }

        const hospitalsMap = new Map<string, Hospital>();

        // Process elements and map them to our Hospital interface
        data.elements.forEach((el: any) => {
            const tags = el.tags || {};
            if (!tags.name) return; // Skip unnamed nodes

            const name = tags.name;
            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;

            if (!lat || !lon) return;

            // Only pick unique names to avoid duplicates (node + way overlapping)
            if (hospitalsMap.has(name)) return;

            let address = [];
            if (tags['addr:housenumber']) address.push(tags['addr:housenumber']);
            if (tags['addr:street']) address.push(tags['addr:street']);
            else if (tags['addr:suburb']) address.push(tags['addr:suburb']);

            if (tags['addr:city']) address.push(tags['addr:city']);

            const formattedAddress = address.length > 0 ? address.join(', ') : 'Location on Map';
            const distance = calculateDistance(latitude, longitude, lat, lon);

            hospitalsMap.set(name, {
                name,
                address: formattedAddress,
                distanceInfo: `${distance} miles away`,
                lat,
                lon
            });
        });

        // Convert map to array and sort by distance
        const sortedHospitals = Array.from(hospitalsMap.values()).sort((a, b) => {
            const distA = parseFloat(a.distanceInfo?.split(' ')[0] || '999');
            const distB = parseFloat(b.distanceInfo?.split(' ')[0] || '999');
            return distA - distB;
        });

        // Return top 6
        return sortedHospitals.slice(0, 6);

    } catch (error) {
        console.error("Error fetching from OSM Overpass: ", error);
        throw error;
    }
};
