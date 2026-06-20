
const baseUrl = "https://missav.live";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/en/new?sort=published_at&page=1", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/en/search/${encodeURIComponent(query)}?page=1`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']thumbnail group["']/i);
    // Also support another layout
    const altItems = html.split(/class=["'][^"']*grid-cols-2[^"']*["']/i);
    let chunks = items.length > 1 ? items : (altItems.length > 1 ? altItems : []);
    
    // Quick regex to find links since structure might vary
    const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']+(?:\/en\/|\/dm)[^"']+)["'][^>]*>[\s\S]*?(?:<img[^>]+(?:data-src|src)=["']([^"']+)["'])?[\s\S]*?(?:<div[^>]+class=["'][^"']*(?:my-2|title|text-secondary)[^"']*["'][^>]*>(.*?)<\/div>|<\/a>)/gi;
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        let url = match[1];
        let poster = match[2] || '';
        let titleMatch = match[0].match(/alt=["']([^"']+)["']/i);
        let title = match[3] ? match[3].replace(/<[^>]+>/g, '').trim() : (titleMatch ? titleMatch[1] : "");
        
        if (title && url) {
            results.push({
                url: url,
                title: title,
                poster: poster
            });
        }
    }
    
    // Removing duplicates
    let uniqueResults = [];
    let set = new Set();
    for (let r of results) {
        if (!set.has(r.url)) {
            set.add(r.url);
            uniqueResults.push(r);
        }
    }
    
    return uniqueResults;
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

function unpack(packed) {
    const pattern = /}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'/;
    const match = pattern.exec(packed);
    if (!match) return packed;

    let p = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const a = parseInt(match[2], 10);
    const c = parseInt(match[3], 10);
    const k = match[4].split('|');

    for (let i = c - 1; i >= 0; i--) {
        if (k[i]) {
            const token = i.toString(a);
            const regex = new RegExp(`\\b${token}\\b`, 'gi');
            p = p.replace(regex, k[i]);
        }
    }
    return p;
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    
    const results = [];
    
    const scripts = res.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scripts) {
        for (let s of scripts) {
            if (s.includes("eval(function(p,a,c,k,e,d)")) {
                const unpacked = unpack(s);
                const playlistMatch = unpacked.match(/\/([a-f0-9\-]{36})\//i);
                if (playlistMatch) {
                    const id = playlistMatch[1];
                    results.push({
                        url: `https://surrit.com/${id}/playlist.m3u8`,
                        quality: "M3U8",
                        isM3U8: true,
                        headers: {
                            "Referer": baseUrl + "/"
                        }
                    });
                }
            }
        }
    }
    
    return results;
}
