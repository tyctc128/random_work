# 手臂動畫素材

保留參考網站的背景、人物與作品，以 SVG 裁切原始圖片的肩膀／上臂、前臂，再接上原本的手掌圖層；不重新繪製手臂。SVG 使用肩膀、手肘的父子關節，移動整隻手臂。

背景補圖：`hero-clean-plate.png`。使用內建 imagegen 工具，以 `hero-nohand-lower.webp` 作為編輯來源，移除固定手臂並補上被遮住的身體與天空。原圖另外保留。

生成提示詞：

> Use case: precise-object-edit. Edit the provided 1536x1024 image as an animation clean plate. REMOVE ONLY Ultraman's foreground arm on the LEFT of the image, from the silver shoulder cap at (125,265) through the bent upper arm/elbow at (160,410) to the silver forearm and wrist ending at (350,470). The entire foreground arm must be absent, with the underlying red-silver torso, waist and sunset/sky plausibly reconstructed. Preserve his head, neck, chest light, legs, OTHER arm holding the board at the top, the board, frame, city, lighting, camera and pixel positions exactly unchanged. Keep original dimensions and framing. NO new arm, no hand in the removed region, no stump protruding forward. This will be covered by the original moving arm layer.
