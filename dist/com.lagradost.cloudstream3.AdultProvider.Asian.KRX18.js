
const baseUrl = "https://krx18.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    };
}

export async function getHome() {
    const res = await http_get(baseUrl, getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const articles = html.split('<article ');
    for (let i = 1; i < articles.length; i++) {
        const item = articles[i];
        const hrefMatch = item.match(/href=["'](https?:\/\/[^"']+)["']/);
        const titleMatch = item.match(/<h2[^>]*>(?:<a[^>]*>)?(.*?)(?:<\/a>)?<\/h2>/i) || item.match(/alt=["']([^"']+)["']/);
        const imgMatch = item.match(/data-src=["']([^"']+)["']/) || item.match(/src=["']([^"']+)["']/);
        
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
    
    const titleMatch = res.match(/<h1[^>]*>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : url;
    
    const descMatch = res.match(/<div class="wp-content">([\s\S]*?)<\/div>/);
    let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";
    
    // Find ajax parameters
    const ajaxParams = {};
    const metaRegex = /data-post=["'](\d+)["'][\s\S]*?data-nume=["'](\w+)["'][\s\S]*?data-type=["'](\w+)["']/g;
    let match;
    const links = [];
    
    while ((match = metaRegex.exec(res)) !== null) {
        ajaxParams.post = match[1];
        ajaxParams.nume = match[2];
        ajaxParams.type = match[3];
        break; // just get the first one for now, or we can iterate over all list items.
    }
    
    // In KRX18, server items usually have data-nume, data-post, data-type
    const listItems = res.match(/<li[^>]*id=["']player-option[^>]*>[\s\S]*?<\/li>/g);
    
    if (listItems) {
        for (const item of listItems) {
            const numMatch = item.match(/data-nume=["'](\w+)["']/);
            const postMatch = item.match(/data-post=["'](\d+)["']/);
            const typeMatch = item.match(/data-type=["'](\w+)["']/);
            const nameMatch = item.match(/<span class="title">([^<]+)<\/span>/);
            
            if (numMatch && postMatch && typeMatch) {
                const linkUrl = `ajax_krx18::${postMatch[1]}::${numMatch[1]}::${typeMatch[1]}`;
                links.push(linkUrl);
            }
        }
    }

    return {
        url: url,
        title: title,
        description: description,
        links: links.length > 0 ? links : [url], // Fallback if no ajax items found
        isMovie: true
    };
}

export async function loadLinks(url) {
    if (url.startsWith("ajax_krx18::")) {
        const parts = url.split("::");
        const postId = parts[1];
        const nume = parts[2];
        const type = parts[3];
        
        const ajaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
        const postData = `action=doo_player_ajax&post=${postId}&nume=${nume}&type=${type}`;
        
        const res = await http_post(ajaxUrl, {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": baseUrl + "/",
            "X-Requested-With": "XMLHttpRequest",
            ...getHeaders()
        }, postData);
        
        try {
            const data = JSON.parse(res);
            if (data.embed_url) {
                let embed = data.embed_url;
                const iframeMatch = embed.match(/src=["']([^"']+)["']/);
                if (iframeMatch) {
                    embed = iframeMatch[1];
                }
                return await loadExtractor(embed);
            }
        } catch(e) {}
    } else {
        const res = await http_get(url, getHeaders());
        const iframeMatch = res.match(/<iframe[^>]+src=["']([^"']+)["']/);
        if (iframeMatch) {
            return await loadExtractor(iframeMatch[1]);
        }
    }
    return [];
}
