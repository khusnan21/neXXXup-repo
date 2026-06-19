import { http_get } from "../utils/network.js";
import { base64Decode } from "../utils/base64.js";

const baseUrl = "https://koreaye.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/page/1/", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/page/1/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']item-video["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        const aTag = item.match(/<a[^>]*class=["']clip-link["'][^>]*>/i);
        if(!aTag) continue;
        
        const hrefMatch = aTag[0].match(/href=["'](https?:\/\/[^"']+)["']/i);
        const titleMatch = aTag[0].match(/title=["']([^"']+)["']/i);
        
        let imgMatch = item.match(/<source[^>]+data-srcset=["']([^"'\s]+)/i) || 
                       item.match(/<source[^>]+srcset=["']([^"'\s]+)/i) ||
                       item.match(/<img[^>]+data-src=["']([^"']+)["']/i) || 
                       item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        if (hrefMatch && titleMatch) {
            let title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            results.push({
                url: hrefMatch[1],
                title: title,
                poster: imgMatch ? imgMatch[1] : ''
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    return {
        url: url,
        title: title,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    // iframe parsing
    const iframeMatch = res.match(/<iframe[^>]+data-src=["']([^"']+)["']/i) || res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
        const iframeUrl = iframeMatch[1];
        
        const iframeRes = await http_get(iframeUrl, {
            ...getHeaders(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        });
        
        const dMatch = iframeRes.match(/_d\s*=\s*["']([^"']+)["']/);
        if (dMatch) {
            const encoded = dMatch[1];
            try {
                const decoded = base64Decode(encoded);
                const lines = decoded.split("\n");
                let firstUrl = "";
                for(const line of lines) {
                    if(line.startsWith("http")) {
                        firstUrl = line;
                        break;
                    }
                }
                if (firstUrl) {
                    const playlistIdMatch = firstUrl.match(/\/playlists\/([^\/]+)\//);
                    if (playlistIdMatch) {
                        const playlistId = playlistIdMatch[1];
                        const host = iframeUrl.split("/player")[0];
                        const finalM3u8Url = `${host}/playlists/${playlistId}/playlist.m3u8`;
                        
                        results.push({
                            url: finalM3u8Url,
                            quality: "M3U8",
                            isM3U8: true,
                            headers: {
                                "Origin": "https://cdnfast.sbs",
                                "Accept": "*/*",
                                "User-Agent": getHeaders()["User-Agent"]
                            }
                        });
                    }
                }
            } catch(e) {}
        }
    }
    
    return results;
}
