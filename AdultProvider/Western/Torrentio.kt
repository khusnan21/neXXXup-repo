package com.lagradost.cloudstream3.AdultProvider.Western

import com.fasterxml.jackson.annotation.JsonProperty
import com.lagradost.api.Log
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addTMDbId
import com.lagradost.cloudstream3.LoadResponse.Companion.addTrailer
import com.lagradost.cloudstream3.LoadResponse.Companion.addScore
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import com.lagradost.cloudstream3.metaproviders.TmdbProvider
import com.lagradost.cloudstream3.utils.*
import com.lagradost.cloudstream3.utils.AppUtils.toJson
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.random.Random

class Torrentio(private val sharedPref: SharedPreferences? = null) : TmdbProvider() {
    private val torrentioUrl = "https://torrentio.strem.fun"
    override var mainUrl =
        "$torrentioUrl/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,ilcorsaronero,magnetdl,onejav,sukebei|sort=seeders|language=indonesian"
    override var name = "Torrentio"
    override val supportedTypes = setOf(TvType.Movie, TvType.TvSeries, TvType.Torrent, TvType.NSFW)
    override var lang = "en"
    override val hasMainPage = true
    private val tmdbAPI = "https://api.themoviedb.org/3"
    private val TRACKER_LIST_URL = "https://newtrackon.com/api/stable"

    private val apiKey = "e6333b32409e02a4a6eba6fb7ff866bb"

    private val today = getDate()
    private val tvFilters = "&language=en-US"

    override val mainPage = mainPageOf(
        "$tmdbAPI/trending/all/day?language=en-US" to "Trending Today",
        "$tmdbAPI/movie/now_playing?language=en-US" to "Now Playing Movies",
        "$tmdbAPI/discover/tv?air_date.gte=$today&air_date.lte=$today&sort_by=vote_average.desc$tvFilters" to "TV Shows Airing Today",
        "$tmdbAPI/movie/popular?language=en-US" to "Popular Movies",
        "$tmdbAPI/discover/tv?vote_count.gte=100$tvFilters" to "Popular TV Shows",
        "$tmdbAPI/movie/top_rated?language=en-US" to "Top Rated Movies",
        "$tmdbAPI/discover/tv?sort_by=vote_average.desc&vote_count.gte=100$tvFilters" to "Top Rated TV Shows",
        "$tmdbAPI/discover/movie?include_adult=true&sort_by=popularity.desc&language=en-US" to "Popular Adult Content"
    )

    private fun getDate(): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val calendar = Calendar.getInstance()
        return formatter.format(calendar.time)
    }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (request.data.contains("include_adult")) request.data else "${request.data}&include_adult=true"
        val finalUrl = if (url.contains("?")) {
            "$url&api_key=$apiKey&page=$page&random=${Random.nextInt()}"
        } else {
            "$url?api_key=$apiKey&page=$page&random=${Random.nextInt()}"
        }
        val resp = try {
            app.get(finalUrl, timeout = 15000).body.string()
        } catch (e: Exception) {
            Log.w("Torrentio", "Gzip error, retry: ${e.message}")
            app.get(finalUrl, timeout = 30000).body.string()
        }
        val parsedResponse = parseJson<Results>(resp).results?.mapNotNull { media ->
            val type = if (request.data.contains("tv")) "tv" else "movie"
            media.toSearchResponse(type = type)
        }?.toMutableList()

        val home = parsedResponse ?: throw ErrorLoadingException("Invalid Json reponse")
        return newHomePageResponse(request.name, home)
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val url = "$tmdbAPI/search/multi?language=en-US&query=$query&page=$page&include_adult=true&api_key=$apiKey"
        val response = app.get(url).parsedSafe<Results>()
        val results = response?.results?.mapNotNull { media ->
            media.toSearchResponse()
        } ?: emptyList()
        val hasNext = page < (response?.totalPages ?: 0)
        return newSearchResponseList(results, hasNext)
    }

    override suspend fun load(url: String): LoadResponse? {
        val data = parseJson<TorrentioData>(url)
        val type = if (data.type == "movie") TvType.Movie else TvType.TvSeries
        val append = "alternative_titles,credits,external_ids,keywords,videos,recommendations"

        val resUrl = if (type == TvType.Movie) {
            "$tmdbAPI/movie/${data.id}?language=en-US&append_to_response=$append&api_key=$apiKey"
        } else {
            "$tmdbAPI/tv/${data.id}?language=en-US&append_to_response=$append&api_key=$apiKey"
        }
        val res = app.get(resUrl).parsedSafe<MediaDetail>()
            ?: throw ErrorLoadingException("Invalid Json Response")

        val title = res.title ?: res.name ?: return null
        val poster = getImageUrl(res.posterPath, getOriginal = true)
        val bgPoster = getImageUrl(res.backdropPath, getOriginal = true)
        val releaseDate = res.releaseDate ?: res.firstAirDate
        val year = releaseDate?.split("-")?.first()?.toIntOrNull()
        val rating = res.voteAverage.toString()
        val genres = res.genres?.mapNotNull { it.name }

        val actors = res.credits?.cast?.mapNotNull { cast ->
            val name = cast.name ?: cast.originalName ?: return@mapNotNull null
            ActorData(
                Actor(name, getImageUrl(cast.profilePath)),
                roleString = cast.character
            )
        } ?: emptyList()

        val recommendations =
            res.recommendations?.results?.mapNotNull { media -> media.toSearchResponse() }

        val trailer = res.videos?.results?.filter { it.type == "Trailer" }
            ?.map { "https://www.youtube.com/watch?v=${it.key}" }?.reversed().orEmpty()
            .ifEmpty { res.videos?.results?.map { "https://www.youtube.com/watch?v=${it.key}" } }

        return if (type == TvType.Movie) {
            newMovieLoadResponse(
                title,
                url,
                TvType.NSFW,
                LinkData(
                    data.id,
                    type = data.type,
                    title = title,
                    year = year,
                    imdbId = res.imdbId,
                    airedDate = res.releaseDate ?: res.firstAirDate,
                ).toJson(),
            ) {
                this.posterUrl = poster
                this.backgroundPosterUrl = bgPoster
                this.year = year
                this.plot = res.overview
                this.duration = res.runtime
                this.tags = genres
                addScore(rating)
                this.recommendations = recommendations
                this.actors = actors
                addTrailer(trailer)
                addTMDbId(data.id.toString())
            }
        } else {
            val episodes = getEpisodes(res, data.id)
            newTvSeriesLoadResponse(
                title,
                url,
                TvType.NSFW,
                episodes,
            ) {
                this.posterUrl = poster
                this.backgroundPosterUrl = bgPoster
                this.year = year
                this.plot = res.overview
                this.tags = genres
                addScore(rating)
                this.recommendations = recommendations
                this.actors = actors
                addTrailer(trailer)
                addTMDbId(data.id.toString())
            }
        }
    }

    private suspend fun getEpisodes(showData: MediaDetail, id: Int?): List<Episode> {
        val episodes = showData.seasons?.mapNotNull { season ->
            val url = "$tmdbAPI/tv/${showData.id}/season/${season.seasonNumber}?api_key=$apiKey"
            app.get(url).parsedSafe<MediaDetailEpisodes>()?.episodes?.map { ep ->
                newEpisode(
                    LinkData(
                        id,
                        type = "tv",
                        season = ep.seasonNumber,
                        episode = ep.episodeNumber,
                        epid = ep.id,
                        title = showData.title,
                        year = season.airDate?.split("-")?.first()?.toIntOrNull(),
                        epsTitle = ep.name,
                        date = season.airDate,
                        imdbId = showData.imdbId ?: showData.externalIds?.imdbId
                    ).toJson()
                ) {
                    this.name = ep.name
                    this.season = ep.seasonNumber
                    this.episode = ep.episodeNumber
                    this.posterUrl = getImageUrl(ep.stillPath)
                    this.description = ep.overview
                }
            }
        }?.flatten()
        return episodes ?: emptyList()
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit,
    ): Boolean {
        val show = parseJson<LinkData>(data)
        val id = show.imdbId ?: return false
        val season = show.season
        val episode = show.episode

        val debridProvider = sharedPref?.getString("debrid_provider", "") ?: ""
        val debridKey = sharedPref?.getString("debrid_key", "") ?: ""

        val hasDebrid = debridProvider != "None" && debridProvider.isNotBlank() && debridKey.isNotBlank()

        if (hasDebrid) {
            when (debridProvider) {
                "RealDebrid" -> invokeTorrentioDebian(mainUrl, debridKey, id, season, episode, callback, "realdebrid")
                "Premiumize" -> invokeTorrentioDebian(mainUrl, debridKey, id, season, episode, callback, "premiumize")
                "TorBox" -> invokeTorrentioDebian(mainUrl, debridKey, id, season, episode, callback, "torbox")
                else -> return invokeMagnetTorrentio(mainUrl, id, season, episode, callback)
            }
            return true
        }

        return invokeMagnetTorrentio(mainUrl, id, season, episode, callback)
    }

    private suspend fun invokeMagnetTorrentio(
        baseUrl: String,
        id: String,
        season: Int?,
        episode: Int?,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val url = if (season == null) {
            "$baseUrl/stream/movie/$id.json"
        } else {
            "$baseUrl/stream/series/$id:$season:$episode.json"
        }
        val headers = mapOf(
            "Accept" to "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "User-Agent" to "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        val res = app.get(url, headers = headers, timeout = 15000L).parsedSafe<TorrentioResponse>()
        var success = false
        res?.streams?.forEach { stream ->
            val formattedTitleName = stream.title
                ?.let { title ->
                    val tags = "\\[(.*?)]".toRegex().findAll(title)
                        .map { match -> "[${match.groupValues[1]}]" }
                        .joinToString(" | ")
                    val seeder = "👤\\s*(\\d+)".toRegex().find(title)?.groupValues?.get(1) ?: "0"
                    val provider =
                        "⚙️\\s*([^\\\\]+)".toRegex().find(title)?.groupValues?.get(1)?.trim()
                            ?: "Unknown"
                    "Torrentio | $tags | Seeder: $seeder | Provider: $provider".trim()
                }
            val magnet = generateMagnetLink(TRACKER_LIST_URL, stream.infoHash)
            if (magnet.isNotEmpty()) success = true
            callback.invoke(
                newExtractorLink(
                    "Torrentio",
                    formattedTitleName ?: stream.name ?: "",
                    url = magnet,
                    INFER_TYPE
                ) {
                    this.referer = ""
                    this.quality = getIndexQuality(stream.name)
                }
            )
        }
        return success
    }

    private suspend fun invokeTorrentioDebian(
        baseUrl: String,
        token: String,
        id: String,
        season: Int?,
        episode: Int?,
        callback: (ExtractorLink) -> Unit,
        provider: String = "realdebrid"
    ) {
        val debridUrl = if (season == null) {
            "$baseUrl|$provider=$token/stream/movie/$id.json"
        } else {
            "$baseUrl|$provider=$token/stream/series/$id:$season:$episode.json"
        }
        val res = app.get(debridUrl, timeout = 15000L).parsedSafe<DebianRoot>() ?: return
        res.streams.forEach { stream ->
            val name = (stream.behaviorHints.filename ?: "").ifBlank { stream.name }
            callback.invoke(
                newExtractorLink(
                    if (provider == "premiumize") "Premiumize" else "RealDebrid",
                    name,
                    stream.url,
                    INFER_TYPE
                ) {
                    this.referer = ""
                    this.quality = getIndexQuality(stream.name)
                }
            )
        }
    }

    private suspend fun generateMagnetLink(url: String, hash: String?): String {
        val response = app.get(url)
        val trackerList = response.text.trim().split("\n")
        return buildString {
            append("magnet:?xt=urn:btih:$hash")
            trackerList.forEach { tracker ->
                if (tracker.isNotBlank()) {
                    append("&tr=").append(tracker.trim())
                }
            }
        }
    }

    private fun getIndexQuality(str: String?): Int {
        return Regex("(\\d{3,4})[pP]").find(str ?: "")?.groupValues?.getOrNull(1)?.toIntOrNull()
            ?: Qualities.Unknown.value
    }

    private fun getImageUrl(link: String?, getOriginal: Boolean = false): String? {
        if (link == null) return null
        val width = if (getOriginal) "original" else "w500"
        return if (link.startsWith("/")) "https://image.tmdb.org/t/p/$width/$link" else link
    }

    private fun Media.toSearchResponse(type: String = "tv"): SearchResponse? {
        if (mediaType == "person") return null
        return newMovieSearchResponse(
            title ?: name ?: originalTitle ?: return null,
            TorrentioData(id = id, type = mediaType ?: type).toJson(),
            TvType.NSFW,
        ) {
            this.posterUrl = getImageUrl(posterPath)
        }
    }
}

data class Results(
    @JsonProperty("results") val results: ArrayList<Media>? = arrayListOf(),
    @JsonProperty("total_pages") val totalPages: Int = 0,
)

data class Media(
    @JsonProperty("id") val id: Int,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("title") val title: String? = null,
    @JsonProperty("original_title") val originalTitle: String? = null,
    @JsonProperty("media_type") val mediaType: String? = null,
    @JsonProperty("poster_path") val posterPath: String? = null,
)

data class TorrentioData(
    val id: Int,
    val type: String? = null,
    val aniId: String? = null,
    val malId: Int? = null,
)

data class MediaDetail(
    @JsonProperty("id") val id: Int? = null,
    @JsonProperty("imdb_id") val imdbId: String? = null,
    @JsonProperty("title") val title: String? = null,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("poster_path") val posterPath: String? = null,
    @JsonProperty("backdrop_path") val backdropPath: String? = null,
    @JsonProperty("release_date") val releaseDate: String? = null,
    @JsonProperty("first_air_date") val firstAirDate: String? = null,
    @JsonProperty("overview") val overview: String? = null,
    @JsonProperty("runtime") val runtime: Int? = null,
    @JsonProperty("vote_average") val voteAverage: Any? = null,
    @JsonProperty("status") val status: String? = null,
    @JsonProperty("genres") val genres: ArrayList<Genres>? = arrayListOf(),
    @JsonProperty("videos") val videos: ResultsTrailer? = null,
    @JsonProperty("recommendations") val recommendations: ResultsRecommendations? = null,
    @JsonProperty("credits") val credits: Credits? = null,
    @JsonProperty("seasons") val seasons: ArrayList<Seasons>? = arrayListOf(),
    @JsonProperty("last_episode_to_air") val lastEpisodeToAir: LastEpisodeToAir? = null,
    @JsonProperty("external_ids") val externalIds: ExternalIds? = null,
)

data class ExternalIds(
    @JsonProperty("imdb_id") val imdbId: String? = null,
    @JsonProperty("tvdb_id") val tvdbId: Int? = null,
)

data class TmdbEpisode(
    @JsonProperty("id") val id: Int? = null,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("overview") val overview: String? = null,
    @JsonProperty("air_date") val airDate: String? = null,
    @JsonProperty("still_path") val stillPath: String? = null,
    @JsonProperty("vote_average") val voteAverage: Double? = null,
    @JsonProperty("episode_number") val episodeNumber: Int? = null,
    @JsonProperty("season_number") val seasonNumber: Int? = null,
)

data class MediaDetailEpisodes(
    @JsonProperty("episodes") val episodes: ArrayList<TmdbEpisode>? = arrayListOf(),
)

data class LastEpisodeToAir(
    @JsonProperty("episode_number") val episodeNumber: Int? = null,
    @JsonProperty("season_number") val seasonNumber: Int? = null,
)

data class Seasons(
    @JsonProperty("id") val id: Int? = null,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("season_number") val seasonNumber: Int? = null,
    @JsonProperty("air_date") val airDate: String? = null,
)

data class Credits(
    @JsonProperty("cast") val cast: ArrayList<Cast>? = arrayListOf(),
)

data class Cast(
    @JsonProperty("id") val id: Int? = null,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("original_name") val originalName: String? = null,
    @JsonProperty("character") val character: String? = null,
    @JsonProperty("known_for_department") val knownForDepartment: String? = null,
    @JsonProperty("profile_path") val profilePath: String? = null,
)

data class Genres(
    @JsonProperty("id") val id: Int? = null,
    @JsonProperty("name") val name: String? = null,
)

data class Trailers(
    @JsonProperty("key") val key: String? = null,
    @JsonProperty("type") val type: String? = null,
)

data class ResultsTrailer(
    @JsonProperty("results") val results: ArrayList<Trailers>? = arrayListOf(),
)

data class ResultsRecommendations(
    @JsonProperty("results") val results: ArrayList<Media>? = arrayListOf(),
)

data class LinkData(
    val id: Int? = null,
    @JsonProperty("imdbId") val imdbId: String? = null,
    val tvdbId: Int? = null,
    val type: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val epid: Int? = null,
    val aniId: String? = null,
    val animeId: String? = null,
    val title: String? = null,
    val year: Int? = null,
    val orgTitle: String? = null,
    val isAnime: Boolean = false,
    val airedYear: Int? = null,
    val lastSeason: Int? = null,
    val epsTitle: String? = null,
    val date: String? = null,
    val airedDate: String? = null,
)

data class TorrentioResponse(
    @JsonProperty("streams") val streams: List<TorrentioStream> = emptyList()
)

data class TorrentioStream(
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("title") val title: String? = null,
    @JsonProperty("infoHash") val infoHash: String? = null,
    @JsonProperty("fileIdx") val fileIdx: Int? = null
)

data class DebianRoot(
    @JsonProperty("streams") val streams: List<DebianStream> = emptyList()
)

data class DebianStream(
    @JsonProperty("name") val name: String = "",
    @JsonProperty("title") val title: String = "",
    @JsonProperty("url") val url: String = "",
    @JsonProperty("behaviorHints") val behaviorHints: DebianBehaviorHints = DebianBehaviorHints()
)

data class DebianBehaviorHints(
    @JsonProperty("bingeGroup") val bingeGroup: String? = null,
    @JsonProperty("filename") val filename: String? = null
)

data class MeteorRoot(
    @JsonProperty("streams") val streams: List<MeteorStream>? = null
)

data class MeteorStream(
    @JsonProperty("name") val name: String = "",
    @JsonProperty("description") val description: String = "",
    @JsonProperty("url") val url: String = "",
    @JsonProperty("behaviorHints") val behaviorHints: MeteorHints = MeteorHints()
)

data class MeteorHints(
    @JsonProperty("filename") val filename: String? = null,
    @JsonProperty("videoSize") val videoSize: Long? = null
)
