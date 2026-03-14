
import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FaceCaptureProps {
  onCapture: (descriptor: Float32Array) => void;
  mode: 'enroll' | 'verify';
}

const FaceCapture: React.FC<FaceCaptureProps> = ({ onCapture, mode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isWarming, setIsWarming] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelLoaded(true);
      } catch (error) {
        console.error('Error loading models:', error);
        toast({
          title: 'Model Loading Failed',
          description: 'Make sure face-api models are in /public/models',
          variant: 'destructive',
        });
      }
    };
    loadModels();
  }, [toast]);

  useEffect(() => {
    if (isModelLoaded && !isCapturing) {
      startVideo();
    }
  }, [isModelLoaded]);

  useEffect(() => {
    let mounted = true;
    const preWarm = async () => {
      if (isCapturing && videoRef.current && !isWarming) {
        try {
          // Ensure video is actually playing before pre-warm
          if (videoRef.current.paused || videoRef.current.ended) {
            await new Promise((resolve) => {
              if (videoRef.current) {
                videoRef.current.onplay = resolve;
              }
            });
          }
          
          if (!mounted) return;
          setIsWarming(true);
          
          // Dummy detection to "pre-warm" the engine
          await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions());
        } catch (e) {
          console.warn("Pre-warm calibration issue:", e);
        } finally {
          if (mounted) setIsWarming(false);
        }
      }
    };
    preWarm();
    return () => { mounted = false; };
  }, [isCapturing]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 20 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCapturing(true);
      }
    } catch (error) {
      console.error('Error starting video:', error);
      toast({
        title: 'Camera Error',
        description: 'Could not access your camera. Please ensure permissions are granted.',
        variant: 'destructive',
      });
    }
  };

  const handleCapture = async () => {
    setLoading(true);
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection && videoRef.current) {
        onCapture(detection.descriptor);
        // Stop video stream safely
        const stream = videoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setIsCapturing(false);
        toast({
          title: 'Face Captured',
          description: mode === 'enroll' ? 'Face successfully enrolled.' : 'Face verified.',
        });
      } else if (!detection) {
        toast({
          title: 'Face Not Detected',
          description: 'Please ensure your face is clearly visible.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 border rounded-xl bg-card relative min-h-[300px]">
      {!isModelLoaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Initializing AI Models...</p>
        </div>
      )}

      <div className="relative w-full max-w-md aspect-video bg-black rounded-lg overflow-hidden shadow-inner border">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {!isCapturing && isModelLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-xs font-bold uppercase tracking-widest">Activating Camera...</p>
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="px-2 py-0.5 rounded bg-black/50 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase text-white tracking-widest">
            {isModelLoaded ? 'AI Ready' : 'AI Loading'}
          </div>
        </div>
      </div>

      <div className="flex flex-col w-full gap-2">
        <Button 
          onClick={handleCapture} 
          disabled={!isCapturing || loading} 
          className="h-12 font-black uppercase tracking-widest shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-95"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {mode === 'enroll' ? 'Enroll My Face' : 'Identify & Check In'}
        </Button>
        <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold tracking-tighter opacity-50 hover:opacity-100" onClick={() => {
          if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
          }
          window.location.reload();
        }}>
          Reset Connection
        </Button>
      </div>
    </div>
  );
};

export default FaceCapture;
