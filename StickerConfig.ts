export type StickerConfig = {
    stickerInfoPath: string,
    uploadImage: boolean,
    fuse: {
        textWeight: number,
        metadata: [{
            name: string,
            weight: number
        }] | null,
        score: boolean,
        limit: number
    }
    cacheMax: number
};
