"""Train a small open/closed-eye CNN and export TensorFlow Lite.

Expected folders:
  data/train/closed/* and data/train/open/*
  data/validation/closed/* and data/validation/open/*
  data/test/closed/* and data/test/open/*

Use driver/session-separated splits where possible to avoid leakage.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score

IMAGE_SIZE = (64, 64)
BATCH_SIZE = 32
SEED = 42


def load_split(path: Path, shuffle: bool):
    if not path.exists():
        raise FileNotFoundError(f"Missing data split: {path}")
    ds = tf.keras.utils.image_dataset_from_directory(
        path,
        labels="inferred",
        label_mode="binary",
        color_mode="grayscale",
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=shuffle,
        seed=SEED,
    )
    return ds.cache().prefetch(tf.data.AUTOTUNE), ds.class_names


def build_model():
    inputs = tf.keras.Input(shape=(IMAGE_SIZE[0], IMAGE_SIZE[1], 1), name="eye_image")
    x = tf.keras.layers.Rescaling(1.0 / 255.0)(inputs)
    x = tf.keras.layers.Conv2D(16, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling2D()(x)
    x = tf.keras.layers.Conv2D(32, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling2D()(x)
    x = tf.keras.layers.Conv2D(64, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling2D()(x)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    x = tf.keras.layers.Dense(32, activation="relu")(x)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid", name="open_probability")(x)
    model = tf.keras.Model(inputs, outputs, name="drowsyguard_eye_cnn")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="binary_crossentropy",
        metrics=[tf.keras.metrics.BinaryAccuracy(name="accuracy"), tf.keras.metrics.Precision(name="precision"), tf.keras.metrics.Recall(name="recall")],
    )
    return model


def dataset_to_arrays(ds):
    images, labels = [], []
    for batch_images, batch_labels in ds:
        images.append(batch_images.numpy())
        labels.append(batch_labels.numpy().reshape(-1).astype(int))
    return np.concatenate(images), np.concatenate(labels)


def main():
    parser = argparse.ArgumentParser(description="Train and export the DrowsyGuard eye-state CNN.")
    parser.add_argument("--data", default="data", help="Dataset root containing train/validation/test subfolders")
    parser.add_argument("--output", default="output", help="Directory for model and evaluation artefacts")
    parser.add_argument("--epochs", type=int, default=15)
    args = parser.parse_args()

    data_root = Path(args.data)
    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)

    train_ds, class_names = load_split(data_root / "train", True)
    val_ds, val_classes = load_split(data_root / "validation", False)
    test_ds, test_classes = load_split(data_root / "test", False)
    if class_names != val_classes or class_names != test_classes:
        raise ValueError(f"Class folder mismatch: train={class_names}, validation={val_classes}, test={test_classes}")
    if set(class_names) != {"closed", "open"}:
        raise ValueError(f"Expected class folders named 'closed' and 'open'; found {class_names}")

    # The standard folder-based label order is alphabetical: closed=0, open=1.
    model = build_model()
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=4, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(str(output_root / "best_eye_cnn.keras"), monitor="val_loss", save_best_only=True),
    ]
    history = model.fit(train_ds, validation_data=val_ds, epochs=max(1, args.epochs), callbacks=callbacks)
    model.save(output_root / "eye_state_cnn.keras")

    test_images, test_labels = dataset_to_arrays(test_ds)
    probabilities = model.predict(test_images, verbose=0).reshape(-1)
    predictions = (probabilities >= 0.5).astype(int)
    metrics = {
        "class_names": class_names,
        "test_accuracy": float(accuracy_score(test_labels, predictions)),
        "test_precision": float(precision_score(test_labels, predictions, zero_division=0)),
        "test_recall": float(recall_score(test_labels, predictions, zero_division=0)),
        "test_f1": float(f1_score(test_labels, predictions, zero_division=0)),
        "confusion_matrix_labels_order": class_names,
        "confusion_matrix": confusion_matrix(test_labels, predictions).tolist(),
        "classification_report": classification_report(test_labels, predictions, target_names=class_names, output_dict=True, zero_division=0),
        "test_examples": int(len(test_labels)),
        "input": {"shape": [64, 64, 1], "colour": "grayscale", "pixel_range": "0-255 uint8 input; model rescales to 0-1"},
        "decision_rule": "sigmoid probability >= 0.5 means class index 1 (open)",
    }
    with open(output_root / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    with open(output_root / "labels.json", "w", encoding="utf-8") as f:
        json.dump({"0": class_names[0], "1": class_names[1]}, f, indent=2)

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()
    (output_root / "eye_state_cnn.tflite").write_bytes(tflite_model)

    print("\nTraining complete")
    print(f"Classes: {class_names} (0=closed, 1=open)")
    print(f"TensorFlow model: {output_root / 'eye_state_cnn.keras'}")
    print(f"TensorFlow Lite model: {output_root / 'eye_state_cnn.tflite'}")
    print(f"Test metrics: {output_root / 'metrics.json'}")
    print(json.dumps({k: metrics[k] for k in ("test_accuracy", "test_precision", "test_recall", "test_f1", "confusion_matrix")}, indent=2))
    print("Note: this exported model is for research use. It is not yet wired into the mobile app's live camera callback.")


if __name__ == "__main__":
    main()
