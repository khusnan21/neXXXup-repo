package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.api.Log
import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.Episode
import com.lagradost.cloudstream3.newEpisode
import com.lagradost.cloudstream3.newTvSeriesLoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.mainPageOf
import com.lagradost.cloudstream3.newHomePageResponse
import com.lagradost.cloudstream3.newMovieLoadResponse
import com.lagradost.cloudstream3.newMovieSearchResponse
import com.lagradost.cloudstream3.newSearchResponseList
import com.lagradost.cloudstream3.newSubtitleFile
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.M3u8Helper.Companion.generateM3u8
import com.lagradost.cloudstream3.utils.Qualities
import com.lagradost.cloudstream3.utils.getExtractorApiFromName
import com.lagradost.cloudstream3.utils.loadExtractor
import com.lagradost.cloudstream3.utils.newExtractorLink
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.net.URLDecoder
import java.net.URLEncoder

data class JavFCVideoCard(
    val title: String,
    val url: String,
    val poster: String? = null,
    val label: String? = null
)

data class JavFCEpisode(
    val name: String,
    val url: String
)

object JavFCUtils {
    const val USER_AGENT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"

    val headers = mapOf(
        "User-Agent" to USER_AGENT,
        "Accept" to "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer" to "${JavFCSeeds.MAIN_URL}/"
    )

    fun cleanText(value: String?): String {
        return value.orEmpty()
            .replace("\u00a0", " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun String.urlEncoded(): String {
        return URLEncoder.encode(this, "UTF-8")
    }

    fun absoluteUrl(baseUrl: String, value: String?): String? {
        val raw = value.orEmpty().trim()
        if (raw.isBlank() || raw == "#" || raw.startsWith("javascript:", ignoreCase = true)) return null
        if (raw.startsWith("//")) return "https:$raw"
        if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
        if (raw.startsWith("/")) return baseUrl.trimEnd('/') + raw
        return baseUrl.trimEnd('/') + "/" + raw
    }

    fun pageUrl(mainUrl: String, data: String, page: Int): String {
        if (data.startsWith("search:")) {
            val query = data.removePrefix("search:")
            val offset = ((page - 1) * 24).coerceAtLeast(0)
            return "$mainUrl/search?per_page=$offset&q=${query.urlEncoded()}"
        }

        val path = data.ifBlank { "/home/vids.html" }
        val normalized = if (path.startsWith("http")) path else mainUrl.trimEnd('/') + "/" + path.trimStart('/')
        if (page <= 1) return normalized

        return when {
            normalized.endsWith(".html") -> normalized.removeSuffix(".html") + "/$page.html"
            normalized.contains("?") -> normalized + "&page=$page"
            else -> normalized.trimEnd('/') + "/$page"
        }
    }

    fun isLikelyMovieUrl(url: String): Boolean {
        val normalized = url.lowercase()
        val isKnownHost = normalized.contains("javfc2.xyz") || normalized.contains("javfc2.live")
        return isKnownHost &&
            !normalized.contains("/genre/") &&
            !normalized.contains("vids.html") &&
            !normalized.contains("ranking.html") &&
            !normalized.contains("/star/") &&
            !normalized.contains("/tag/") &&
            !normalized.contains("/search") &&
            !normalized.contains("all-movies") &&
            !normalized.contains("privacy") &&
            !normalized.contains("dmca") &&
            (normalized.endsWith(".html") || normalized.contains("?key=") || normalized.contains("&key="))
    }
}

object JavFCSeeds {
    const val MAIN_URL = "https://javfc2.xyz"
    const val LIVE_URL = "https://javfc2.live"

    object Path {
        const val HOME = "/home/vids.html"
        const val ALL_MOVIES = "/all-movies.html"
        const val RANKING = "/home/ranking.html"
        const val ENG_SUB = "/genre/eng-sub.html"
        const val FC2 = "/genre/fc2.html"
        const val JAV = "/genre/jav.html"
        const val WEBCAM = "/genre/webcam.html"
        const val CHINA_AV = "/genre/china-av.html"
        const val IPX = "/genre/ipx.html"
        const val FSDCC = "/genre/fsdcc.html"
        const val JUY = "/genre/juy.html"
        const val STAR = "/star/1055.html"
    }

    object Search {
        const val CHINA_AV = "China AV"
        const val IPX = "ipx"
        const val FSDCC = "fsdcc"
        const val AMATEUR = "amateur"
        const val UNCENSORED = "uncensored"
        const val JAPANESE = "japanese"
        const val STUDENT = "student"
    }

    fun mainPagePairs(): Array<Pair<String, String>> = arrayOf(
        Path.HOME to "Terbaru",
        Path.ALL_MOVIES to "All Movies",
        Path.RANKING to "Ranking",
        Path.ENG_SUB to "Engsub",
        Path.FC2 to "FC2PPV",
        Path.JAV to "JAV",
        Path.WEBCAM to "Webcam",
        "search:${Search.CHINA_AV}" to "China AV",
        Path.CHINA_AV to "China AV (Katalog)",
        "search:${Search.AMATEUR}" to "Amateur",
        "search:${Search.UNCENSORED}" to "Uncensored",
        "search:${Search.JAPANESE}" to "Japanese",
        "search:${Search.STUDENT}" to "Student"
    )
}

object JavFCParser {
    fun parseListing(api: MainAPI, document: Document): List<SearchResponse> {
        val primary = document.select(".movie-container > div")
        val fallback = document.select(".movie-item, .video-item, .item, article, .col-md-3, .col-sm-4")
        val candidates = if (primary.isNotEmpty()) primary else fallback

        return candidates
            .mapNotNull { parseCard(api, it) }
            .distinctBy { it.url }
            .take(48)
    }

    private fun parseCard(api: MainAPI, element: Element): SearchResponse? {
        val label = JavFCUtils.cleanText(element.selectFirst(".label, .badge")?.text())
        if (label.equals("Actor", ignoreCase = true) || label.equals("Seller", ignoreCase = true)) return null

        val link = element.selectFirst(".movie-title a[href]")
            ?: element.selectFirst("h3 a[href], h2 a[href], .title a[href]")
            ?: element.selectFirst("a[href]")
            ?: return null

        val href = JavFCUtils.absoluteUrl(api.mainUrl, link.attr("href")) ?: return null
        if (!JavFCUtils.isLikelyMovieUrl(href)) return null

        val image = element.selectFirst("img")
        val title = JavFCUtils.cleanText(
            listOfNotNull(
                element.selectFirst(".movie-title")?.text(),
                element.selectFirst(".title")?.text(),
                element.selectFirst("h3, h2")?.text(),
                link.attr("title"),
                link.text(),
                image?.attr("alt"),
                image?.attr("title")
            ).firstOrNull { it.isNotBlank() }
        ).ifBlank { return null }

        val poster = image?.let {
            JavFCUtils.absoluteUrl(
                api.mainUrl,
                it.attr("data-src").ifBlank {
                    it.attr("data-original").ifBlank {
                        it.attr("data-lazy-src").ifBlank {
                            it.attr("src")
                        }
                    }
                }
            )
        }

        return api.newMovieSearchResponse(title, href, TvType.NSFW) {
            posterUrl = poster
            posterHeaders = JavFCUtils.headers
        }
    }

    suspend fun parseLoadResponse(api: MainAPI, url: String, document: Document): LoadResponse {
        val title = JavFCUtils.cleanText(
            document.selectFirst("h1.title, .title, h1, .video-title")?.text()
                ?: document.selectFirst("meta[property=og:title]")?.attr("content")
                ?: "JavFC Video"
        ).ifBlank { "JavFC Video" }

        val poster = JavFCUtils.absoluteUrl(
            api.mainUrl,
            document.selectFirst("meta[property=og:image]")?.attr("content")
                ?: document.selectFirst("#info img, .poster img, .movie-cover img, .cover img, .thumb img")?.let {
                    it.attr("data-src").ifBlank { it.attr("data-original").ifBlank { it.attr("src") } }
                }
        )

        val plot = JavFCUtils.cleanText(
            document.selectFirst(".description, .desc, #description, .movie-description, .info-description")?.text()
                ?: document.selectFirst("meta[name=description]")?.attr("content")
        )

        val tags = document.select("a[href*=/genre/], a[href*='search?q='], a[href*='search?per_page=']")
            .map { JavFCUtils.cleanText(it.text()) }
            .filter { it.length in 2..40 }
            .distinct()
            .take(12)

        val episodes = parseEpisodes(api, document, url)
        val recommendations = parseListing(api, document).filterNot { it.url == url }.take(12)

        return api.newTvSeriesLoadResponse(title, url, TvType.NSFW, episodes) {
            posterUrl = poster
            this.posterHeaders = JavFCUtils.headers
            this.plot = plot
            this.tags = tags
            this.recommendations = recommendations
        }
    }

    private fun parseEpisodes(api: MainAPI, document: Document, fallbackUrl: String): List<Episode> {
        val seen = mutableSetOf<String>()

        val items = document.select(
            ".season a[href]:not([data-toggle]), .episodes a[href], .episode a[href], a[href*='?key='], a[href*='&key=']"
        ).mapNotNull { a ->
            val href = JavFCUtils.absoluteUrl(api.mainUrl, a.attr("href")) ?: return@mapNotNull null
            if (!JavFCUtils.isLikelyMovieUrl(href)) return@mapNotNull null
            if (!seen.add(href.substringBefore("#"))) return@mapNotNull null

            val text = JavFCUtils.cleanText(a.text())
            val epName = text.ifBlank {
                if (href.contains("key=", ignoreCase = true)) "Playback" else "Movie"
            }

            api.newEpisode(href) {
                name = epName
            }
        }

        return if (items.isNotEmpty()) {
            items
        } else {
            listOf(
                api.newEpisode(fallbackUrl) {
                    name = "Movie"
                }
            )
        }
    }
}

object JavFCExtractor {
    private val classicPlayerSrcRegex = Regex(
        """(?is)\bsrc\s*:\s*['\"`]([^'\"`]+)['\"`]"""
    )
    private val keyValueUrlRegex = Regex(
        """(?is)(?:src|file|url|source|hlsUrl|videoUrl|playlist)\s*[:=]\s*['\"`]([^'\"`]+)['\"`]"""
    )
    private val quotedMediaRegex = Regex(
        """(?i)['\"`]((?:https?:)?//[^'\"<>\\\s]+?\.(?:m3u8|mp4)(?:\?[^'\"<>\\\s]*)?)['\"`]"""
    )
    private val bareMediaRegex = Regex(
        """(?i)(?:https?:)?//[^\s'\"<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s'\"<>\\]*)?"""
    )
    private val encodedHttpRegex = Regex(
        """(?i)https?%3A%2F%2F[^'\"<>\\\s]+"""
    )

    suspend fun loadLinks(
        providerName: String,
        mainUrl: String,
        data: String,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val document = app.get(
            data,
            headers = JavFCUtils.headers,
            referer = mainUrl
        ).document

        var found = false

        collectSubtitles(mainUrl, document, subtitleCallback)

        val playerUrls = extractPlayerUrls(mainUrl, document)
        val directUrls = extractDirectUrls(mainUrl, document)
        val embedUrls = extractEmbedUrls(mainUrl, document, playerUrls)
        val code = data.substringAfterLast('/').substringBeforeLast('.').substringBefore('?')

        (playerUrls + directUrls).distinct().forEach { url ->
            try {
                if (url.contains(".mp4", ignoreCase = true)) {
                    found = true
                    callback(
                        newExtractorLink(providerName, "$providerName MP4", url) {
                            referer = mainUrl
                            quality = Qualities.Unknown.value
                            headers = JavFCUtils.headers
                        }
                    )
                } else {
                    var emitted = false

                    try {
                        generateM3u8(
                            source = providerName,
                            streamUrl = url,
                            referer = mainUrl,
                            headers = JavFCUtils.headers
                        ).forEach { link ->
                            emitted = true
                            found = true
                            callback(link)
                        }
                    } catch (e: Throwable) {
                        Log.e("JavFC", "HLS candidate failed: ${e.message}")
                    }

                    if (!emitted) {
                        loadExtractor(url, mainUrl, subtitleCallback) { link ->
                            found = true
                            callback(link)
                        }
                    }
                }
            } catch (e: Throwable) {
                Log.e("JavFC", "Direct/player media failed: ${e.message}")
            }
        }

        embedUrls.forEach { embed ->
            try {
                loadExtractor(embed, mainUrl, subtitleCallback) { link ->
                    found = true
                    callback(link)
                }
            } catch (e: Throwable) {
                Log.e("JavFC", "Embed extractor failed: ${e.message}")
            }
        }

        if (code.isNotBlank()) {
            try {
                val subApi = getExtractorApiFromName("SubtitleCat")
                if (subApi != null && subApi.name.equals("SubtitleCat", ignoreCase = true)) {
                    subApi.getUrl(
                        url = code,
                        referer = mainUrl,
                        subtitleCallback = subtitleCallback,
                        callback = { link ->
                            found = true
                            callback(link)
                        }
                    )
                }
            } catch (e: Throwable) {
                Log.e("JavFC", "SubtitleCat failed: ${e.message}")
            }
        }

        if (!found) {
            Log.e("JavFC", "No playable media found for: $data")
        }

        return found
    }

    private suspend fun collectSubtitles(
        mainUrl: String,
        document: Document,
        subtitleCallback: (SubtitleFile) -> Unit
    ) {
        document.select("track[kind=subtitles], track[src], a[href$=.srt], a[href$=.vtt]").forEach { element ->
            val subUrl = JavFCUtils.absoluteUrl(mainUrl, element.attr("src").ifBlank { element.attr("href") }) ?: return@forEach
            val label = JavFCUtils.cleanText(element.attr("label").ifBlank { element.text().ifBlank { "Subtitle" } })
            subtitleCallback(newSubtitleFile(label, subUrl))
        }
    }

    private fun extractPlayerUrls(mainUrl: String, document: Document): List<String> {
        val direct = linkedSetOf<String>()
        val playerRaw = normalizedHtml(
            document.select("#player-div script, #player-div, .player script, .player, script:containsData(src:), script:containsData(hlsUrl), script:containsData(videoUrl), script:containsData(playlist)")
                .joinToString("\n") { it.html() }
        )

        classicPlayerSrcRegex.findAll(playerRaw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.groupValues[1]) }
            .forEach { direct.add(it) }

        keyValueUrlRegex.findAll(playerRaw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.groupValues[1]) }
            .forEach { direct.add(it) }

        encodedHttpRegex.findAll(playerRaw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.value) }
            .forEach { direct.add(it) }

        return direct.distinct()
    }

    private fun extractDirectUrls(mainUrl: String, document: Document): List<String> {
        val raw = normalizedHtml(document.html())
        val direct = linkedSetOf<String>()

        document.select("video[src], video source[src], source[src]").forEach { source ->
            normalizeMediaUrl(mainUrl, source.attr("src"))?.let { direct.add(it) }
        }

        keyValueUrlRegex.findAll(raw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.groupValues[1]) }
            .forEach { direct.add(it) }

        quotedMediaRegex.findAll(raw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.groupValues[1]) }
            .forEach { direct.add(it) }

        bareMediaRegex.findAll(raw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.value) }
            .forEach { direct.add(it) }

        encodedHttpRegex.findAll(raw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.value) }
            .forEach { direct.add(it) }

        return direct.distinct()
    }

    private fun extractEmbedUrls(mainUrl: String, document: Document, knownPlayerUrls: List<String>): List<String> {
        val raw = normalizedHtml(document.html())
        val embeds = linkedSetOf<String>()

        document.select("iframe[src], embed[src]").forEach { iframe ->
            JavFCUtils.absoluteUrl(mainUrl, iframe.attr("src"))?.let { embeds.add(it) }
        }

        keyValueUrlRegex.findAll(raw)
            .mapNotNull { normalizeMediaUrl(mainUrl, it.groupValues[1]) }
            .filterNot { value ->
                knownPlayerUrls.any { it == value } ||
                    value.contains(".m3u8", ignoreCase = true) ||
                    value.contains(".mp4", ignoreCase = true)
            }
            .forEach { embeds.add(it) }

        return embeds.filter { it.startsWith("http") }.distinct()
    }

    private fun normalizedHtml(value: String): String {
        return value
            .replace("\\/", "/")
            .replace("&amp;", "&")
            .replace("\\u0026", "&")
            .replace("%2F", "/", ignoreCase = true)
            .replace("%3A", ":", ignoreCase = true)
            .replace("%3F", "?", ignoreCase = true)
            .replace("%26", "&", ignoreCase = true)
            .replace("%3D", "=", ignoreCase = true)
    }

    private fun normalizeMediaUrl(mainUrl: String, value: String?): String? {
        val cleaned = value.orEmpty()
            .replace("\\/", "/")
            .replace("&amp;", "&")
            .replace("\\u0026", "&")
            .trim()
            .trim('"', '\'', '`', ',', ';')

        val raw = decodeUrlCandidate(cleaned)
            .replace("\\/", "/")
            .replace("&amp;", "&")
            .replace("\\u0026", "&")
            .trim()
            .trim('"', '\'', '`', ',', ';')

        if (raw.isBlank() || raw.equals("null", ignoreCase = true)) return null
        if (raw.startsWith("data:", ignoreCase = true)) return null
        if (raw.startsWith("blob:", ignoreCase = true)) return null

        return when {
            raw.startsWith("//") -> "https:$raw"
            raw.startsWith("http://") || raw.startsWith("https://") -> raw
            raw.startsWith("/") -> JavFCUtils.absoluteUrl(mainUrl, raw)
            else -> null
        }
    }

    private fun decodeUrlCandidate(value: String): String {
        if (!value.contains("%")) return value

        var current = value.replace("+", "%2B")
        repeat(2) {
            val decoded = try {
                URLDecoder.decode(current, "UTF-8")
            } catch (_: Throwable) {
                current
            }
            if (decoded == current) return current
            current = decoded
        }
        return current
    }
}

class JavFCProvider : MainAPI() {
    override var mainUrl = JavFCSeeds.MAIN_URL
    override var name = "JavFC"
    override val hasMainPage = true
    override var lang = "en"
    override val supportedTypes = setOf(TvType.NSFW)

    override val mainPage = mainPageOf(*JavFCSeeds.mainPagePairs())

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = JavFCUtils.pageUrl(mainUrl, request.data, page)
        val document = app.get(url, headers = JavFCUtils.headers).document
        val results = JavFCParser.parseListing(this, document)
        return newHomePageResponse(request.name, results, results.isNotEmpty())
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val offset = ((page - 1) * 24).coerceAtLeast(0)
        val url = "$mainUrl/search?per_page=$offset&q=${JavFCUtils.run { query.urlEncoded() }}"
        val document = app.get(url, headers = JavFCUtils.headers).document
        val results = JavFCParser.parseListing(this, document)
        return newSearchResponseList(results, results.isNotEmpty())
    }

    override suspend fun load(url: String): LoadResponse {
        val document = app.get(url, headers = JavFCUtils.headers).document
        return JavFCParser.parseLoadResponse(this, url, document)
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        return JavFCExtractor.loadLinks(name, mainUrl, data, subtitleCallback, callback)
    }
}
